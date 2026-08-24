import { describe, expect, it } from "vitest";

import {
  constantFx,
  constantSeries,
  growingSeries,
  makeAsset,
  makeInput,
  makeParams,
  makeSeries,
  weekdays,
} from "@/test/fixtures/series";
import type { AssetPerformance } from "./types";
import { runBacktest, BacktestError } from "./run-backtest";
import { DEFAULT_FEES } from "./fees";

/**
 * Chaque cas est construit pour que le résultat attendu se calcule de tête ou
 * en une ligne. Un test dont on ne sait pas justifier le nombre attendu ne
 * prouve rien sur la justesse du moteur — il fige seulement son comportement
 * actuel, bogues compris.
 */

describe("actif unique sans frais", () => {
  it("reproduit exactement la performance de l'actif", () => {
    // 100 → 200 : le capital doit doubler, ni plus ni moins.
    const prices = growingSeries("2020-01-01", 500, 100, 200);
    const asset = makeAsset("A", prices);
    const params = makeParams({ initialAmount: 10_000 });

    const result = runBacktest(makeInput([asset], params));

    expect(result.metrics.finalValue).toBeCloseTo(20_000, 6);
    expect(result.metrics.totalInvested).toBe(10_000);
    expect(result.metrics.totalReturn).toBeCloseTo(1, 9);
    expect(result.metrics.fees.total).toBe(0);
  });

  it("n'inflige aucun drawdown à une série monotone croissante", () => {
    const prices = growingSeries("2020-01-01", 300, 100, 150);
    const result = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams()),
    );

    expect(result.metrics.drawdown.maxDrawdown).toBe(0);
    expect(result.metrics.drawdown.troughDate).toBeNull();
  });
});

describe("versements programmés", () => {
  it("sur une série à prix constant, la valeur finale égale la somme versée", () => {
    // Prix figé à 100 : aucune performance possible, la valeur ne peut venir
    // que des versements eux-mêmes.
    const prices = constantSeries("2020-01-01", 300, 100);
    const params = makeParams({
      initialAmount: 1_000,
      monthlyContribution: 100,
    });

    const result = runBacktest(
      makeInput([makeAsset("A", prices)], params),
    );

    expect(result.metrics.finalValue).toBeCloseTo(
      result.metrics.totalInvested,
      6,
    );
    expect(result.metrics.totalReturn).toBeCloseTo(0, 9);
    expect(result.metrics.cagr).toBeCloseTo(0, 9);
    expect(result.metrics.volatility).toBeCloseTo(0, 9);
  });

  it("compte un versement par mois entamé après le premier", () => {
    // 300 jours ouvrés à partir du 1er janvier 2020 couvrent un peu plus de
    // quatorze mois ; le premier mois ne reçoit pas de versement puisque le
    // capital initial y a déjà été investi.
    const prices = constantSeries("2020-01-01", 300, 100);
    const params = makeParams({
      initialAmount: 1_000,
      monthlyContribution: 100,
    });

    const result = runBacktest(makeInput([makeAsset("A", prices)], params));

    const monthsCovered = new Set(
      weekdays("2020-01-01", 300).map((d) => d.slice(0, 7)),
    ).size;

    expect(result.metrics.totalInvested).toBe(1_000 + 100 * (monthsCovered - 1));
  });

  it("neutralise les versements dans le rendement pondéré par le temps", () => {
    // L'actif double ; les versements gonflent la valeur finale mais ne doivent
    // pas gonfler la performance mesurée.
    const prices = growingSeries("2020-01-01", 500, 100, 200);
    const withoutDca = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams()),
    );
    const withDca = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({ monthlyContribution: 500 }),
      ),
    );

    expect(withDca.metrics.finalValue).toBeGreaterThan(
      withoutDca.metrics.finalValue,
    );
    expect(withDca.metrics.cagr).toBeCloseTo(withoutDca.metrics.cagr, 9);
  });
});

describe("rééquilibrage", () => {
  it("ramène un portefeuille 50/50 dérivé à ses poids cibles", () => {
    // A double, B reste plat. Sans rééquilibrage, A finit à 2/3 du
    // portefeuille ; avec, il revient à la moitié.
    const dates = 400;
    const a = makeAsset("A", growingSeries("2020-01-01", dates, 100, 200), {
      targetWeight: 0.5,
    });
    const b = makeAsset("B", constantSeries("2020-01-01", dates, 100), {
      targetWeight: 0.5,
    });

    const drifting = runBacktest(
      makeInput([a, b], makeParams({ initialAmount: 10_000 })),
    );
    const rebalanced = runBacktest(
      makeInput(
        [a, b],
        makeParams({
          initialAmount: 10_000,
          rebalancing: {
            period: "monthly",
            thresholdEnabled: false,
            thresholdPoints: 5,
          },
        }),
      ),
    );

    const finalWeight = (r: typeof drifting, id: string) => {
      const last = r.series.byAsset[r.series.byAsset.length - 1].valueByAsset;
      const total = Object.values(last).reduce((s, v) => s + v, 0);
      return last[id] / total;
    };

    expect(finalWeight(drifting, "A")).toBeCloseTo(2 / 3, 6);

    // Le dernier rééquilibrage date du début du mois en cours : A a repris un
    // peu d'avance depuis. Le poids doit donc être proche de la cible sans lui
    // être exactement égal — l'exiger égal reviendrait à tester un
    // rééquilibrage quotidien.
    expect(Math.abs(finalWeight(rebalanced, "A") - 0.5)).toBeLessThan(0.01);

    // Rééquilibrer en vendant le gagnant pour racheter le perdant coûte de la
    // performance quand le gagnant continue de monter : c'est le comportement
    // attendu, pas une anomalie.
    expect(rebalanced.metrics.finalValue).toBeLessThan(
      drifting.metrics.finalValue,
    );
  });

  it("se déclenche sur dérive même sans rééquilibrage de calendrier", () => {
    const dates = 400;
    const a = makeAsset("A", growingSeries("2020-01-01", dates, 100, 200), {
      targetWeight: 0.5,
    });
    const b = makeAsset("B", constantSeries("2020-01-01", dates, 100), {
      targetWeight: 0.5,
    });

    const result = runBacktest(
      makeInput(
        [a, b],
        makeParams({
          rebalancing: {
            period: "none",
            thresholdEnabled: true,
            thresholdPoints: 5,
          },
        }),
      ),
    );

    const last = result.series.byAsset[result.series.byAsset.length - 1]
      .valueByAsset;
    const total = last.A + last.B;

    // Le seuil autorise une dérive de 5 points : le poids final doit rester
    // dans la bande, loin des 2/3 atteints sans rééquilibrage.
    expect(Math.abs(last.A / total - 0.5)).toBeLessThan(0.05);
  });

  it("ne rééquilibre pas quand les deux mécanismes sont désactivés", () => {
    const dates = 400;
    const a = makeAsset("A", growingSeries("2020-01-01", dates, 100, 200), {
      targetWeight: 0.5,
    });
    const b = makeAsset("B", constantSeries("2020-01-01", dates, 100), {
      targetWeight: 0.5,
    });

    const result = runBacktest(makeInput([a, b], makeParams()));
    const last = result.series.byAsset[result.series.byAsset.length - 1]
      .valueByAsset;

    expect(last.A / (last.A + last.B)).toBeCloseTo(2 / 3, 6);
  });
});

describe("conversion de change", () => {
  it("convertit un actif en dollars au taux historique", () => {
    // Prix stable à 100 USD, euro passant de 1 USD = 1 EUR à 1 USD = 0,50 EUR :
    // en euros, la position perd exactement la moitié de sa valeur.
    const count = 300;
    const dates = weekdays("2020-01-01", count);
    const prices = constantSeries("2020-01-01", count, 100);
    const fx = dates.map((date, i) => ({
      date,
      rateToEur: 1 - (0.5 * i) / (count - 1),
    }));

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices, { currency: "USD" })],
        makeParams({ initialAmount: 10_000 }),
        { fx: { USD: fx } },
      ),
    );

    expect(result.metrics.finalValue).toBeCloseTo(5_000, 6);
  });

  it("laisse un actif en euros inchangé même si une série de change existe", () => {
    const count = 200;
    const prices = constantSeries("2020-01-01", count, 100);

    const result = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams({ initialAmount: 5_000 }), {
        fx: { USD: constantFx("2020-01-01", count, 0.5) },
      }),
    );

    expect(result.metrics.finalValue).toBeCloseTo(5_000, 6);
  });

  it("repousse la date de départ à la première cotation de change disponible", () => {
    // L'actif cote depuis 2018 mais le taux de change n'existe qu'à partir de
    // 2020 : c'est la contrainte de change qui doit gagner.
    const prices = constantSeries("2018-01-01", 800, 100);
    const fx = constantFx("2020-01-01", 300, 1);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices, { currency: "USD" })],
        makeParams(),
        { fx: { USD: fx } },
      ),
    );

    expect(result.metrics.startDate >= "2020-01-01").toBe(true);
  });
});

describe("frais", () => {
  it("un TER de 0,38 % coûte environ 3,7 % de capital sur dix ans", () => {
    // Référence analytique : (1 − 0,0038)^10 ≈ 0,96266, soit 3,73 % de perte.
    // Le prélèvement quotidien au prorata des jours donne un résultat très
    // légèrement différent de la composition annuelle, d'où la tolérance.
    const years = 10;
    const count = 261 * years;
    const prices = constantSeries("2010-01-01", count, 100);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices, { ter: 0.0038 })],
        makeParams({
          initialAmount: 10_000,
          fees: {
            brokeragePercent: 0,
            brokerageMinEur: 0,
            spreadPercent: 0,
            applyTer: true,
          },
        }),
      ),
    );

    const elapsedYears = result.metrics.effectiveYears;
    const expected = 10_000 * Math.pow(1 - 0.0038, elapsedYears);

    // L'écart avec la composition annuelle est de l'ordre de l'euro sur dix
    // mille : le prélèvement quotidien au prorata n'est pas exactement la
    // puissance annuelle, et c'est le prélèvement quotidien qui reflète la
    // réalité d'un fonds. On vérifie donc l'ordre de grandeur, à deux euros près.
    expect(Math.abs(result.metrics.finalValue - expected)).toBeLessThan(2);

    const dragPercent = 1 - result.metrics.finalValue / 10_000;
    expect(dragPercent).toBeGreaterThan(0.036);
    expect(dragPercent).toBeLessThan(0.039);

    expect(result.metrics.fees.ter).toBeCloseTo(10_000 - result.metrics.finalValue, 6);
    expect(result.metrics.fees.brokerage).toBe(0);
    expect(result.metrics.fees.spread).toBe(0);
  });

  it("prélève courtage et spread sur le versement initial", () => {
    // 10 000 € investis à 0,1 % de courtage puis 0,1 % de spread sur le solde :
    // 10 € de courtage, puis 9,99 € de spread.
    const prices = constantSeries("2020-01-01", 100, 100);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({
          initialAmount: 10_000,
          fees: { ...DEFAULT_FEES, applyTer: false },
        }),
      ),
    );

    expect(result.metrics.fees.brokerage).toBeCloseTo(10, 6);
    expect(result.metrics.fees.spread).toBeCloseTo(9.99, 6);
    expect(result.metrics.finalValue).toBeCloseTo(10_000 - 19.99, 6);
  });

  it("borne le courtage minimum au montant de l'ordre", () => {
    // Un courtier à 5 € minimum et un versement de 2 € : le coût ne peut pas
    // dépasser l'ordre, sinon la valeur du portefeuille deviendrait négative.
    const prices = constantSeries("2020-01-01", 100, 100);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({
          initialAmount: 2,
          fees: {
            brokeragePercent: 0.001,
            brokerageMinEur: 5,
            spreadPercent: 0.001,
            applyTer: false,
          },
        }),
      ),
    );

    expect(result.metrics.finalValue).toBeGreaterThanOrEqual(0);
    expect(result.metrics.fees.brokerage).toBeCloseTo(2, 6);
  });

  it("chiffre le coût des frais par différence avec un run sans frais", () => {
    const prices = growingSeries("2015-01-01", 1_500, 100, 180);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices, { ter: 0.0038 })],
        makeParams({
          initialAmount: 10_000,
          monthlyContribution: 200,
          fees: DEFAULT_FEES,
        }),
      ),
    );

    expect(result.metrics.finalValueGross).toBeGreaterThan(
      result.metrics.finalValue,
    );
    expect(result.metrics.feeImpact).toBeCloseTo(
      result.metrics.finalValueGross - result.metrics.finalValue,
      6,
    );
    // Le manque à gagner dépasse les frais nominaux : les euros prélevés tôt ne
    // travaillent plus jusqu'au terme.
    expect(result.metrics.feeImpact).toBeGreaterThan(result.metrics.fees.total);
  });
});

describe("actifs plus jeunes que la période demandée", () => {
  const oldAsset = () =>
    makeAsset("VIEUX", constantSeries("2010-01-01", 3_000, 100), {
      targetWeight: 0.5,
    });

  const youngPrices = growingSeries("2020-01-01", 500, 100, 150);

  it("signale l'actif concerné avec sa date de première cotation", () => {
    const young = makeAsset("JEUNE", youngPrices, { targetWeight: 0.5 });

    const result = runBacktest(
      makeInput([oldAsset(), young], makeParams({ years: 10 })),
    );

    expect(result.youngAssets).toHaveLength(1);
    expect(result.youngAssets[0].assetId).toBe("JEUNE");
    expect(result.youngAssets[0].inceptionDate).toBe("2020-01-01");
    expect(result.youngAssets[0].hasProxy).toBe(false);
  });

  it("démarre à la date du plus jeune actif en l'absence de proxy", () => {
    const young = makeAsset("JEUNE", youngPrices, { targetWeight: 0.5 });

    const result = runBacktest(
      makeInput([oldAsset(), young], makeParams({ years: 10 })),
    );

    expect(result.metrics.startDate).toBe("2020-01-01");
    expect(result.usedProxyData).toBe(false);
  });

  it("remonte plus loin avec un proxy, en raccordant les niveaux de prix", () => {
    // Le proxy cote autour de 3 000 quand l'actif démarre à 100 : le raccord
    // doit se faire sur les variations, pas sur les niveaux, sinon la valeur du
    // portefeuille ferait un bond au point de jonction.
    const proxy = makeSeries("2015-01-01", 1_400, (i) => 3_000 + i);
    const young = makeAsset("JEUNE", youngPrices, {
      targetWeight: 0.5,
      proxyPrices: proxy,
      proxyCurrency: "EUR",
    });

    const result = runBacktest(
      makeInput(
        [oldAsset(), young],
        makeParams({ years: 10, youngAssetResolution: "use-proxy" }),
      ),
    );

    expect(result.metrics.startDate < "2020-01-01").toBe(true);
    expect(result.usedProxyData).toBe(true);

    // Aucun saut de valeur : le plus grand écart quotidien reste modeste.
    const values = result.series.portfolio.map((p) => p.value);
    const biggestJump = values
      .slice(1)
      .reduce(
        (max, v, i) => Math.max(max, Math.abs(v / values[i] - 1)),
        0,
      );
    expect(biggestJump).toBeLessThan(0.05);
  });

  it("marque les jours valorisés par le proxy", () => {
    const proxy = makeSeries("2015-01-01", 1_400, (i) => 3_000 + i);
    const young = makeAsset("JEUNE", youngPrices, {
      targetWeight: 1,
      proxyPrices: proxy,
      proxyCurrency: "EUR",
    });

    const result = runBacktest(
      makeInput(
        [young],
        makeParams({ years: 10, youngAssetResolution: "use-proxy" }),
      ),
    );

    const proxyDays = result.series.portfolio.filter((p) => p.hasProxyData);
    expect(proxyDays.length).toBeGreaterThan(0);
    expect(proxyDays.every((p) => p.date < "2020-01-01")).toBe(true);
  });
});

describe("fenêtre imposée", () => {
  // 501 jours ouvrés de 100 à 200 : le prix à mi-parcours vaut 100 × √2, donc
  // un départ forcé ce jour-là multiplie le capital par 200 / (100 × √2) = √2.
  const dates = weekdays("2020-01-01", 501);
  const prices = growingSeries("2020-01-01", 501, 100, 200);

  it("part de la date demandée avec le capital initial entier", () => {
    const result = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams({ initialAmount: 10_000 }), {
        startDate: dates[250],
      }),
    );

    expect(result.metrics.startDate).toBe(dates[250]);
    // Le capital initial est versé à la date imposée, et non conservé depuis un
    // départ antérieur : c'est ce qui rend deux allocations superposables.
    expect(result.series.portfolio[0].value).toBeCloseTo(10_000, 6);
    expect(result.metrics.totalInvested).toBe(10_000);
    expect(result.metrics.finalValue).toBeCloseTo(10_000 * Math.SQRT2, 3);
  });

  it("ne remonte pas avant la première cotation disponible", () => {
    const result = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams(), {
        startDate: "2015-01-01",
      }),
    );

    expect(result.metrics.startDate).toBe(dates[0]);
  });

  it("prime sur la durée demandée", () => {
    // Un an de durée nominale, mais une fenêtre imposée qui couvre tout :
    // c'est la fenêtre qui gagne.
    const result = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams({ years: 1 }), {
        startDate: dates[0],
      }),
    );

    expect(result.metrics.startDate).toBe(dates[0]);
    expect(result.metrics.finalValue).toBeCloseTo(20_000, 3);
  });
});

describe("fiscalité", () => {
  it("applique 17,2 % en PEA et 30 % en compte-titres sur le même gain", () => {
    // 10 000 € qui doublent : 10 000 € de plus-value.
    // PEA  : 20 000 − 1 720 = 18 280 €.
    // CTO  : 20 000 − 3 000 = 17 000 €.
    const prices = growingSeries("2010-01-01", 2_000, 100, 200);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices, { peaEligible: true })],
        makeParams({ initialAmount: 10_000, taxation: true }),
      ),
    );

    expect(result.metrics.taxation).toBeDefined();
    expect(result.metrics.taxation!.capitalGain).toBeCloseTo(10_000, 6);
    expect(result.metrics.taxation!.netValuePea).toBeCloseTo(18_280, 6);
    expect(result.metrics.taxation!.netValueCto).toBeCloseTo(17_000, 6);
    expect(result.metrics.taxation!.peaEligible).toBe(true);
  });

  it("nomme les actifs qui rendent la stratégie inéligible au PEA", () => {
    const count = 500;
    const a = makeAsset("A", constantSeries("2020-01-01", count, 100), {
      targetWeight: 0.5,
      peaEligible: true,
      label: "ETF World",
    });
    const b = makeAsset("B", constantSeries("2020-01-01", count, 100), {
      targetWeight: 0.5,
      peaEligible: false,
      label: "Bitcoin",
    });

    const result = runBacktest(
      makeInput([a, b], makeParams({ taxation: true })),
    );

    expect(result.metrics.taxation!.peaEligible).toBe(false);
    expect(result.metrics.taxation!.peaBlockingAssets).toEqual(["Bitcoin"]);
  });
});

describe("rendement réel", () => {
  it("déflate la valeur finale par l'inflation observée", () => {
    // Prix des actifs figés, indice des prix passant de 100 à 125 : le pouvoir
    // d'achat du capital est divisé par 1,25.
    const count = 800;
    const prices = constantSeries("2015-01-01", count, 100);

    const months: { period: string; hicpIndex: number }[] = [];
    for (let i = 0; i < 48; i += 1) {
      const year = 2015 + Math.floor(i / 12);
      const month = String((i % 12) + 1).padStart(2, "0");
      months.push({
        period: `${year}-${month}-01`,
        hicpIndex: 100 + (25 * i) / 47,
      });
    }

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({ initialAmount: 10_000, realReturns: true }),
        { inflation: months },
      ),
    );

    expect(result.metrics.finalValue).toBeCloseTo(10_000, 6);
    expect(result.metrics.real).toBeDefined();
    expect(result.metrics.real!.finalValue).toBeLessThan(10_000);
    expect(result.metrics.real!.cagr).toBeLessThan(0);
  });

  it("laisse les métriques réelles identiques aux nominales sans inflation", () => {
    // Indice des prix figé : la déflation est l'identité. C'est le test qui
    // garantit que la seconde passe n'introduit aucun biais de calcul.
    const prices = growingSeries("2015-01-01", 800, 100, 180);
    const months = flatIndex("2015-01-01", 48, 100);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({ initialAmount: 10_000, realReturns: true }),
        { inflation: months },
      ),
    );

    const { metrics } = result;
    expect(metrics.real!.finalValue).toBeCloseTo(metrics.finalValue, 6);
    expect(metrics.real!.cagr).toBeCloseTo(metrics.cagr, 9);
    expect(metrics.real!.volatility).toBeCloseTo(metrics.volatility, 9);
    expect(metrics.real!.drawdown.maxDrawdown).toBeCloseTo(
      metrics.drawdown.maxDrawdown,
      9,
    );
    expect(metrics.real!.annualInflation).toBeCloseTo(0, 9);
  });

  it("retrouve le taux d'inflation annualisé et le retranche du rendement", () => {
    // Portefeuille figé à 10 000 € et prix qui doublent en dix ans :
    // l'inflation annualisée vaut 2^(1/10) − 1 ≈ 7,177 %, et le rendement réel
    // d'un capital immobile en est exactement l'opposé multiplicatif.
    const days = 10 * 365;
    const prices = constantSeries("2010-01-01", days, 100);
    const months = geometricIndex("2010-01-01", 121, 100, 200);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({ initialAmount: 10_000, realReturns: true }),
        { inflation: months },
      ),
    );

    const real = result.metrics.real!;
    const years = result.metrics.effectiveYears;

    expect(real.annualInflation).toBeCloseTo(Math.pow(2, 1 / years) - 1, 4);
    expect(real.finalValue).toBeCloseTo(5_000, 0);
    expect(real.cagr).toBeCloseTo(1 / Math.pow(2, 1 / years) - 1, 4);
  });

  it("creuse la baisse maximale plutôt que de la laisser inchangée", () => {
    // C'était le défaut : seule la valeur finale était déflatée, si bien que la
    // baisse maximale réelle restait égale à la nominale. Une chute de marché
    // doublée d'une hausse des prix se traverse pourtant deux fois.
    const span = 10 * 365;
    const third = span / 3;
    // Montée de 100 à 150, chute de 40 %, puis remontée.
    const prices = makeSeries("2010-01-01", span, (i) =>
      i < third
        ? 100 + (50 * i) / third
        : i < 2 * third
          ? 150 - (60 * (i - third)) / third
          : 90 + (60 * (i - 2 * third)) / third,
    );

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({ initialAmount: 10_000, realReturns: true }),
        { inflation: geometricIndex("2010-01-01", 121, 100, 200) },
      ),
    );

    const { metrics } = result;
    expect(metrics.drawdown.maxDrawdown).toBeLessThan(0);
    expect(metrics.real!.drawdown.maxDrawdown).toBeLessThan(
      metrics.drawdown.maxDrawdown,
    );
  });

  it("déflate chaque versement à sa propre date", () => {
    // Versements réguliers sur dix ans d'inflation : le capital engagé en euros
    // constants est nécessairement inférieur au cumul nominal, mais supérieur à
    // ce que donnerait une déflation en bloc au taux terminal.
    const days = 10 * 365;
    const prices = constantSeries("2010-01-01", days, 100);
    const months = geometricIndex("2010-01-01", 121, 100, 200);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({
          initialAmount: 1_000,
          monthlyContribution: 100,
          realReturns: true,
        }),
        { inflation: months },
      ),
    );

    const { metrics } = result;
    const nominal = metrics.totalInvested;
    const enBloc = nominal * 0.5; // déflation au seul taux terminal

    expect(metrics.real!.totalInvested).toBeLessThan(nominal);
    expect(metrics.real!.totalInvested).toBeGreaterThan(enBloc);
  });
});

/** Indice des prix constant : aucune inflation. */
function flatIndex(start: string, count: number, value: number) {
  return monthlyIndex(start, count, () => value);
}

/** Indice croissant géométriquement de `from` à `to` sur `count` mois. */
function geometricIndex(
  start: string,
  count: number,
  from: number,
  to: number,
) {
  const ratio = Math.pow(to / from, 1 / (count - 1));
  return monthlyIndex(start, count, (i) => from * Math.pow(ratio, i));
}

function monthlyIndex(
  start: string,
  count: number,
  valueAt: (index: number) => number,
) {
  const [year, month] = start.split("-").map(Number);
  const points: { period: string; hicpIndex: number }[] = [];

  for (let i = 0; i < count; i += 1) {
    const total = month - 1 + i;
    const y = year + Math.floor(total / 12);
    const m = String((total % 12) + 1).padStart(2, "0");
    points.push({ period: `${y}-${m}-01`, hicpIndex: valueAt(i) });
  }

  return points;
}

describe("entrées invalides", () => {
  it("refuse une somme de poids différente de 100 %", () => {
    const prices = constantSeries("2020-01-01", 100, 100);
    const a = makeAsset("A", prices, { targetWeight: 0.6 });
    const b = makeAsset("B", prices, { targetWeight: 0.3 });

    expect(() => runBacktest(makeInput([a, b], makeParams()))).toThrow(
      BacktestError,
    );
  });

  it("refuse une stratégie vide", () => {
    expect(() => runBacktest(makeInput([], makeParams()))).toThrow(
      BacktestError,
    );
  });

  it("refuse une période commune vide", () => {
    // Deux actifs dont les historiques ne se recouvrent pas du tout.
    const a = makeAsset("A", constantSeries("2010-01-01", 200, 100), {
      targetWeight: 0.5,
    });
    const b = makeAsset("B", constantSeries("2022-01-01", 200, 100), {
      targetWeight: 0.5,
    });

    expect(() => runBacktest(makeInput([a, b], makeParams()))).toThrow(
      BacktestError,
    );
  });
});

describe("détail par actif", () => {
  it("fait exactement le total du portefeuille, sans rééquilibrage", () => {
    // Sans rééquilibrage ni frais, l'identité est facile à poser à la main :
    // chaque ligne reçoit sa part du versement, et rien ne circule ensuite.
    const a = makeAsset("A", growingSeries("2020-01-01", 500, 100, 200), { targetWeight: 0.6 });
    const b = makeAsset("B", growingSeries("2020-01-01", 500, 100, 150), { targetWeight: 0.4 });

    const result = runBacktest(
      makeInput(
        [a, b],
        makeParams({
          initialAmount: 10_000,
          rebalancing: { period: "none", thresholdEnabled: false, thresholdPoints: 5 },
        }),
      ),
    );

    const rows = result.assetPerformance;
    const { metrics } = result;

    // 6 000 € doublent, 4 000 € font +50 % : 12 000 + 6 000 = 18 000 €.
    expect(rows.find((r) => r.assetId === "A")!.invested).toBeCloseTo(6_000, 6);
    expect(rows.find((r) => r.assetId === "A")!.finalValue).toBeCloseTo(12_000, 6);
    expect(rows.find((r) => r.assetId === "B")!.finalValue).toBeCloseTo(6_000, 6);

    expect(sum(rows, "invested")).toBeCloseTo(metrics.totalInvested, 6);
    expect(sum(rows, "finalValue")).toBeCloseTo(metrics.finalValue, 6);
    expect(sum(rows, "gain")).toBeCloseTo(metrics.totalGain, 6);
  });

  it("fait toujours le total avec rééquilibrage, versements et frais", () => {
    // Le cas qui casse une comptabilité naïve : le rééquilibrage déplace de
    // l'argent entre les lignes et les ordres coûtent, sans qu'aucun euro ne
    // doive disparaître du décompte.
    const a = makeAsset("A", growingSeries("2018-01-01", 900, 100, 260), { targetWeight: 0.5 });
    const b = makeAsset("B", growingSeries("2018-01-01", 900, 100, 120), { targetWeight: 0.5 });

    const result = runBacktest(
      makeInput(
        [a, b],
        makeParams({
          initialAmount: 5_000,
          monthlyContribution: 200,
          fees: DEFAULT_FEES,
          rebalancing: { period: "quarterly", thresholdEnabled: true, thresholdPoints: 5 },
        }),
      ),
    );

    const rows = result.assetPerformance;
    const { metrics } = result;

    expect(metrics.fees.total).toBeGreaterThan(0);
    expect(sum(rows, "invested")).toBeCloseTo(metrics.totalInvested, 6);
    expect(sum(rows, "finalValue")).toBeCloseTo(metrics.finalValue, 6);
    expect(sum(rows, "gain")).toBeCloseTo(metrics.totalGain, 6);
    expect(rows.reduce((t, r) => t + r.finalWeight, 0)).toBeCloseTo(1, 6);
  });

  it("rapporte la performance propre du support, indépendante des montants", () => {
    // La ligne ne reçoit que 10 % du capital, mais le support double : sa
    // performance propre vaut 100 %, quel que soit le montant engagé.
    const a = makeAsset("A", growingSeries("2020-01-01", 400, 100, 200), { targetWeight: 0.1 });
    const b = makeAsset("B", constantSeries("2020-01-01", 400, 100), { targetWeight: 0.9 });

    const result = runBacktest(
      makeInput([a, b], makeParams({ initialAmount: 10_000 })),
    );

    const rowA = result.assetPerformance.find((r) => r.assetId === "A")!;
    expect(rowA.assetReturn).toBeCloseTo(1, 6);
    expect(rowA.invested).toBeCloseTo(1_000, 6);
    expect(rowA.gain).toBeCloseTo(1_000, 6);
    expect(rowA.gainShare).toBeCloseTo(1, 6); // seule ligne à produire du gain
  });

  it("n'attribue aucune part de gain quand le portefeuille en manque", () => {
    // Rapporter une part à un total nul ou négatif produirait des pourcentages
    // aberrants ; on préfère l'absence de valeur.
    const a = makeAsset("A", growingSeries("2020-01-01", 400, 100, 60));

    const result = runBacktest(
      makeInput([a], makeParams({ initialAmount: 10_000 })),
    );

    expect(result.metrics.totalGain).toBeLessThan(0);
    expect(result.assetPerformance[0].gainShare).toBeNull();
  });

  it("décompose le montant investi en versements et rééquilibrages", () => {
    // Une ligne qui monte beaucoup est allégée à chaque rééquilibrage. Ses
    // retraits peuvent dépasser ses apports, et le net devient négatif — le cas
    // qui rend le seul chiffre net incompréhensible sans sa décomposition.
    const fusee = makeAsset("FUSEE", growingSeries("2015-01-01", 1200, 100, 6000), {
      targetWeight: 0.05,
    });
    const calme = makeAsset("CALME", growingSeries("2015-01-01", 1200, 100, 130), {
      targetWeight: 0.95,
    });

    const result = runBacktest(
      makeInput(
        [fusee, calme],
        makeParams({
          initialAmount: 1_000,
          monthlyContribution: 300,
          rebalancing: { period: "quarterly", thresholdEnabled: false, thresholdPoints: 5 },
        }),
      ),
    );

    const rows = result.assetPerformance;
    const { metrics } = result;

    // Les versements se répartissent exactement au poids cible.
    expect(sum(rows, "contributed")).toBeCloseTo(metrics.totalInvested, 6);
    expect(rows.find((r) => r.assetId === "FUSEE")!.contributed).toBeCloseTo(
      metrics.totalInvested * 0.05,
      6,
    );

    // Rééquilibrer ne fait entrer aucun argent neuf : somme nulle.
    expect(sum(rows, "rebalancingFlow")).toBeCloseTo(0, 6);

    // Et la décomposition reconstitue bien le net, ligne par ligne.
    for (const row of rows) {
      expect(row.contributed + row.rebalancingFlow).toBeCloseTo(row.invested, 6);
    }

    // La ligne fusée a été allégée bien au-delà de ce qu'elle a reçu.
    const fuseeRow = rows.find((r) => r.assetId === "FUSEE")!;
    expect(fuseeRow.rebalancingFlow).toBeLessThan(0);
    expect(fuseeRow.invested).toBeLessThan(0);
  });

  it("déflate aussi la référence, pas seulement le portefeuille", () => {
    // C'est le point : confronter une courbe en euros constants à un indice en
    // euros courants, sur le graphique même censé les comparer, avantage
    // l'indice d'exactement l'inflation de la période.
    const days = 10 * 365;
    const prices = constantSeries("2010-01-01", days, 100);

    const result = runBacktest(
      makeInput(
        [makeAsset("A", prices)],
        makeParams({ initialAmount: 10_000, realReturns: true }),
        {
          inflation: geometricIndex("2010-01-01", 121, 100, 200),
          benchmark: {
            id: "REF",
            ticker: "REF",
            label: "Référence",
            currency: "EUR",
            prices: growingSeries("2010-01-01", days, 100, 200),
          },
        },
      ),
    );

    const points = result.series.benchmark!;
    const last = points[points.length - 1];

    // La référence double en nominal : 10 000 € deviennent 20 000 €.
    expect(last.value).toBeCloseTo(20_000, 0);
    // Les prix ayant doublé eux aussi, elle stagne en pouvoir d'achat.
    expect(last.realValue).toBeCloseTo(10_000, 0);
    expect(points[0].realValue).toBeCloseTo(points[0].value, 6);
  });

  it("laisse la référence intacte quand le rendement réel n'est pas demandé", () => {
    const prices = constantSeries("2010-01-01", 500, 100);
    const result = runBacktest(
      makeInput([makeAsset("A", prices)], makeParams({ initialAmount: 10_000 }), {
        benchmark: {
          id: "REF",
          ticker: "REF",
          label: "Référence",
          currency: "EUR",
          prices: growingSeries("2010-01-01", 500, 100, 150),
        },
      }),
    );

    expect(result.series.benchmark![0].realValue).toBeUndefined();
  });

  it("annualise la performance du support sur la durée simulée", () => {
    // Un support qui double sur exactement dix ans : 2^(1/10) − 1 ≈ 7,177 %.
    const days = 10 * 365;
    const a = makeAsset("A", growingSeries("2010-01-01", days, 100, 200));

    const result = runBacktest(
      makeInput([a], makeParams({ initialAmount: 10_000 })),
    );

    const row = result.assetPerformance[0];
    const years = result.metrics.effectiveYears;

    expect(row.assetReturn).toBeCloseTo(1, 6);
    expect(row.assetAnnualReturn).toBeCloseTo(Math.pow(2, 1 / years) - 1, 6);

    // Sur un seul actif sans frais, l'annualisé de la ligne rejoint le CAGR du
    // portefeuille : c'est le contrôle qui garantit qu'on n'a pas confondu les
    // deux bases de composition.
    expect(row.assetAnnualReturn).toBeCloseTo(result.metrics.cagr, 4);
  });

  it("déflate chaque flux à sa date pour la version en euros constants", () => {
    const days = 10 * 365;
    const a = makeAsset("A", constantSeries("2010-01-01", days, 100));

    const result = runBacktest(
      makeInput(
        [a],
        makeParams({
          initialAmount: 1_000,
          monthlyContribution: 100,
          realReturns: true,
        }),
        { inflation: geometricIndex("2010-01-01", 121, 100, 200) },
      ),
    );

    const reel = result.assetPerformanceReal!;
    expect(reel).toHaveLength(1);
    expect(sum(reel, "invested")).toBeCloseTo(result.metrics.real!.totalInvested, 6);
    expect(sum(reel, "finalValue")).toBeCloseTo(result.metrics.real!.finalValue, 6);
    expect(sum(reel, "gain")).toBeCloseTo(result.metrics.real!.totalGain, 6);

    // Prix figé : la performance propre du support est nulle en nominal et
    // négative une fois l'inflation retirée.
    expect(result.assetPerformance[0].assetReturn).toBeCloseTo(0, 6);
    expect(reel[0].assetReturn).toBeCloseTo(-0.5, 2);
  });
});

function sum(
  rows: readonly AssetPerformance[],
  key: "invested" | "finalValue" | "gain" | "contributed" | "rebalancingFlow",
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
