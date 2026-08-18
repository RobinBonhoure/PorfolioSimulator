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
});

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
