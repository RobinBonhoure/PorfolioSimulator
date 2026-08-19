import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROJECTION,
  ProjectionError,
  meanReturnStandardError,
  runProjection,
  type ProjectionConfig,
} from "./projection";

/**
 * Série mensuelle synthétique : moyenne et amplitude connues, mais irrégulière.
 *
 * L'irrégularité est indispensable. Une série qui alterne strictement hausse et
 * baisse rend tout bloc de douze mois identique — six hausses, six baisses, même
 * produit —, la dispersion s'annule et le rééchantillonnage n'a plus rien à
 * échantillonner. Un générateur congruentiel à graine fixe donne des tirages
 * variés tout en restant parfaitement reproductible d'une exécution à l'autre.
 */
function syntheticReturns(count: number, monthlyMean: number, amplitude: number) {
  let state = 987654321;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };

  return Array.from({ length: count }, () => monthlyMean + (next() * 2 - 1) * amplitude);
}

const baseConfig = (overrides: Partial<ProjectionConfig> = {}): ProjectionConfig => ({
  ...DEFAULT_PROJECTION,
  initialAmount: 10_000,
  monthlyContribution: 0,
  years: 10,
  expectedInflation: 0,
  paths: 500,
  ...overrides,
});

describe("recentrage sur l'hypothèse de rendement", () => {
  it("impose la tendance centrale quelle que soit la moyenne historique", () => {
    // Historique à ~12 % par an, hypothèse retenue à 5 % : c'est l'hypothèse
    // qui doit piloter le résultat, sinon le réglage ne servirait à rien.
    const history = syntheticReturns(240, 0.01, 0.03);

    const result = runProjection(
      history,
      baseConfig({ expectedAnnualReturn: 0.05 }),
    );

    expect(result.historicalAnnualReturn).toBeGreaterThan(0.1);
    expect(result.appliedAnnualReturn).toBe(0.05);

    // La médiane sur dix ans doit être proche de 10 000 × 1,05¹⁰ ≈ 16 289 €.
    // La tolérance couvre l'écart entre médiane et moyenne d'une distribution
    // log-normale, ainsi que l'aléa de tirage.
    const expected = 10_000 * Math.pow(1.05, 10);
    expect(result.terminal.p50).toBeGreaterThan(expected * 0.8);
    expect(result.terminal.p50).toBeLessThan(expected * 1.2);
  });

  it("interprète l'hypothèse comme un taux composé, pas arithmétique", () => {
    // Sans versement ni inflation, la médiane doit croître exactement au taux
    // annoncé : c'est ce que l'utilisateur comprend en lisant « 6 % par an ».
    // Un recentrage sur la moyenne arithmétique donnerait ici une médiane
    // sensiblement inférieure, l'écart valant environ σ²/2.
    const history = syntheticReturns(360, 0.004, 0.05);

    const result = runProjection(
      history,
      baseConfig({
        expectedAnnualReturn: 0.06,
        years: 15,
        monthlyContribution: 0,
        paths: 4_000,
      }),
    );

    const attendu = 10_000 * Math.pow(1.06, 15);
    expect(result.terminal.p50 / attendu).toBeGreaterThan(0.93);
    expect(result.terminal.p50 / attendu).toBeLessThan(1.07);
  });

  it("rapporte un rendement historique égal au taux composé de la série", () => {
    // La valeur affichée comme « rendement historique » doit être celle
    // réellement appliquée quand on choisit cette option, sinon l'étiquette
    // ment sur le calcul.
    const history = syntheticReturns(240, 0.005, 0.04);

    const result = runProjection(
      history,
      baseConfig({ expectedAnnualReturn: null }),
    );

    const croissanceTotale = history.reduce((acc, r) => acc * (1 + r), 1);
    const composeAnnuel = Math.pow(croissanceTotale, 12 / history.length) - 1;

    expect(result.historicalAnnualReturn).toBeCloseTo(composeAnnuel, 9);
    expect(result.appliedAnnualReturn).toBeCloseTo(composeAnnuel, 9);
  });

  it("refuse un historique contenant une perte totale", () => {
    const history = [...syntheticReturns(60, 0.005, 0.02), -1];
    expect(() => runProjection(history, baseConfig())).toThrow(ProjectionError);
  });

  it("conserve la moyenne historique quand aucune hypothèse n'est donnée", () => {
    const history = syntheticReturns(240, 0.004, 0.02);
    const result = runProjection(
      history,
      baseConfig({ expectedAnnualReturn: null }),
    );

    expect(result.appliedAnnualReturn).toBeCloseTo(
      result.historicalAnnualReturn,
      12,
    );
  });

  it("laisse la dispersion venir des données, pas de l'hypothèse", () => {
    // Deux historiques de même moyenne mais d'amplitudes très différentes,
    // ramenés à la même hypothèse : l'éventail doit rester bien plus large
    // pour le plus volatil.
    const calme = syntheticReturns(240, 0.005, 0.005);
    const agite = syntheticReturns(240, 0.005, 0.06);

    const a = runProjection(calme, baseConfig({ expectedAnnualReturn: 0.06 }));
    const b = runProjection(agite, baseConfig({ expectedAnnualReturn: 0.06 }));

    const largeur = (r: typeof a) => r.terminal.p95 / r.terminal.p5;
    expect(largeur(b)).toBeGreaterThan(largeur(a) * 2);
  });
});

describe("structure de l'éventail", () => {
  const result = runProjection(
    syntheticReturns(240, 0.005, 0.03),
    baseConfig({ expectedAnnualReturn: 0.07 }),
  );

  it("produit un point par mois, borne initiale comprise", () => {
    expect(result.points).toHaveLength(10 * 12 + 1);
    expect(result.points[0].month).toBe(0);
  });

  it("ordonne les centiles à chaque date", () => {
    for (const point of result.points) {
      expect(point.p5).toBeLessThanOrEqual(point.p25);
      expect(point.p25).toBeLessThanOrEqual(point.p50);
      expect(point.p50).toBeLessThanOrEqual(point.p75);
      expect(point.p75).toBeLessThanOrEqual(point.p95);
    }
  });

  it("part du capital initial, sans dispersion au premier jour", () => {
    const start = result.points[0];
    expect(start.p5).toBeCloseTo(10_000, 6);
    expect(start.p95).toBeCloseTo(10_000, 6);
  });

  it("élargit l'éventail avec le temps", () => {
    const largeur = (i: number) =>
      result.points[i].p95 - result.points[i].p5;

    expect(largeur(12)).toBeGreaterThan(largeur(1));
    expect(largeur(120)).toBeGreaterThan(largeur(12));
  });
});

describe("versements programmés", () => {
  it("compte le capital investi versement par versement", () => {
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.02),
      baseConfig({ initialAmount: 1_000, monthlyContribution: 100, years: 5 }),
    );

    expect(result.totalInvested).toBeCloseTo(1_000 + 100 * 60, 6);
    expect(result.points.at(-1)!.invested).toBeCloseTo(1_000 + 100 * 60, 6);
  });

  it("sur une série à rendement nul, la valeur égale les versements", () => {
    // Aucun rendement : la seule source de valeur est l'argent versé.
    const result = runProjection(
      new Array(240).fill(0),
      baseConfig({
        initialAmount: 1_000,
        monthlyContribution: 100,
        years: 5,
        expectedAnnualReturn: 0,
      }),
    );

    expect(result.terminal.p50).toBeCloseTo(result.totalInvested, 6);
    expect(result.terminal.p5).toBeCloseTo(result.terminal.p95, 6);
    expect(result.probabilityBelowInvested).toBe(0);
  });
});

describe("euros constants", () => {
  it("réduit tous les montants quand une inflation est supposée", () => {
    const history = syntheticReturns(240, 0.005, 0.02);
    const config = baseConfig({ expectedAnnualReturn: 0.07, years: 20 });

    const nominal = runProjection(history, { ...config, expectedInflation: 0 });
    const reel = runProjection(history, { ...config, expectedInflation: 0.02 });

    expect(reel.inRealTerms).toBe(true);
    expect(nominal.inRealTerms).toBe(false);
    expect(reel.terminal.p50).toBeLessThan(nominal.terminal.p50);

    // Vingt ans à 2 % divisent le pouvoir d'achat par 1,02²⁰ ≈ 1,486.
    expect(reel.terminal.p50).toBeCloseTo(
      nominal.terminal.p50 / Math.pow(1.02, 20),
      4,
    );
  });

  it("déflate aussi la ligne de capital investi", () => {
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.02),
      baseConfig({
        initialAmount: 1_000,
        monthlyContribution: 100,
        years: 10,
        expectedInflation: 0.02,
      }),
    );

    expect(result.totalInvested).toBeLessThan(1_000 + 100 * 120);
  });
});

describe("reproductibilité", () => {
  it("donne exactement le même éventail à graine identique", () => {
    const history = syntheticReturns(240, 0.005, 0.03);
    const config = baseConfig({ expectedAnnualReturn: 0.07 });

    const a = runProjection(history, config);
    const b = runProjection(history, config);

    expect(a.terminal).toEqual(b.terminal);
    expect(a.points.at(-1)).toEqual(b.points.at(-1));
  });

  it("donne un éventail différent à graine différente", () => {
    const history = syntheticReturns(240, 0.005, 0.03);

    const a = runProjection(history, baseConfig({ seed: 1 }));
    const b = runProjection(history, baseConfig({ seed: 2 }));

    expect(a.terminal.p50).not.toBe(b.terminal.p50);
  });
});

describe("garde-fous", () => {
  it("refuse un historique trop court", () => {
    expect(() =>
      runProjection(new Array(12).fill(0.005), baseConfig()),
    ).toThrow(ProjectionError);
  });

  it("borne la probabilité de perte entre 0 et 1", () => {
    const result = runProjection(
      syntheticReturns(240, -0.002, 0.05),
      baseConfig({ expectedAnnualReturn: -0.02 }),
    );

    expect(result.probabilityBelowInvested).toBeGreaterThanOrEqual(0);
    expect(result.probabilityBelowInvested).toBeLessThanOrEqual(1);
  });

  it("détecte une hypothèse négative comme telle", () => {
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.02),
      baseConfig({ expectedAnnualReturn: -0.03, years: 10 }),
    );

    expect(result.terminal.p50).toBeLessThan(10_000);
    expect(result.probabilityBelowInvested).toBeGreaterThan(0.5);
  });
});

describe("erreur type sur le rendement moyen", () => {
  it("décroît en racine du nombre d'années", () => {
    // 15 % de volatilité sur 20 ans : environ 3,35 points d'erreur type.
    expect(meanReturnStandardError(0.15, 20)).toBeCloseTo(0.0335, 4);
    // Il faut quatre fois plus d'années pour diviser l'erreur par deux.
    expect(meanReturnStandardError(0.15, 80)).toBeCloseTo(
      meanReturnStandardError(0.15, 20) / 2,
      6,
    );
  });
});

describe("capital engagé, la ligne de référence", () => {
  it("part de la mise initiale et ne décroît jamais", () => {
    // Régression : la référence déflatait le solde nominal entier à la date
    // finale. Sur un capital de départ important et des versements modestes,
    // l'érosion de la mise l'emportait et la courbe **décroissait** — elle
    // décrivait le pouvoir d'achat d'un matelas, pas ce qui a été engagé.
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.03),
      baseConfig({
        initialAmount: 400_000,
        monthlyContribution: 500,
        years: 20,
        expectedInflation: 0.02,
      }),
    );

    expect(result.points[0].invested).toBeCloseTo(400_000, 6);

    for (let i = 1; i < result.points.length; i += 1) {
      expect(result.points[i].invested).toBeGreaterThan(
        result.points[i - 1].invested,
      );
    }
  });

  it("compte chaque versement au pouvoir d'achat de sa propre date", () => {
    // Un versement effectué dans dix ans vaut moins qu'un versement
    // d'aujourd'hui : le cumul réel reste donc inférieur au cumul nominal.
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.02),
      baseConfig({
        initialAmount: 10_000,
        monthlyContribution: 1_000,
        years: 20,
        expectedInflation: 0.02,
      }),
    );

    const nominal = 10_000 + 1_000 * 240;
    expect(result.totalInvested).toBeLessThan(nominal);
    expect(result.totalInvested).toBeGreaterThan(10_000);

    // Somme actualisée mois par mois, calculée indépendamment.
    let attendu = 10_000;
    for (let m = 1; m <= 240; m += 1) attendu += 1_000 * Math.pow(1.02, -m / 12);
    expect(result.totalInvested).toBeCloseTo(attendu, 6);
  });

  it("sans inflation, le capital engagé égale le cumul nominal", () => {
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.02),
      baseConfig({
        initialAmount: 10_000,
        monthlyContribution: 250,
        years: 10,
        expectedInflation: 0,
      }),
    );

    expect(result.totalInvested).toBeCloseTo(10_000 + 250 * 120, 6);
  });

  it("compare la probabilité de perte dans une unité cohérente", () => {
    // Trajectoires en euros courants, référence en euros constants : comparer
    // les deux directement surestimerait fortement le risque de perte.
    const sansInflation = runProjection(
      syntheticReturns(240, 0.006, 0.02),
      baseConfig({ initialAmount: 100_000, monthlyContribution: 0, years: 10, expectedInflation: 0 }),
    );
    const avecInflation = runProjection(
      syntheticReturns(240, 0.006, 0.02),
      baseConfig({ initialAmount: 100_000, monthlyContribution: 0, years: 10, expectedInflation: 0.02 }),
    );

    // Sans versement, le seuil est le même en termes réels comme nominaux :
    // la probabilité de perte doit être identique dans les deux affichages.
    expect(avecInflation.probabilityBelowInvested).toBeCloseTo(
      sansInflation.probabilityBelowInvested,
      6,
    );
  });
});

describe("démarrage sans capital initial", () => {
  it("part de zéro et ne doit sa valeur qu'aux versements", () => {
    const result = runProjection(
      syntheticReturns(240, 0.005, 0.03),
      baseConfig({
        initialAmount: 0,
        monthlyContribution: 500,
        years: 20,
        expectedAnnualReturn: 0.07,
        expectedInflation: 0,
      }),
    );

    const debut = result.points[0];
    expect(debut.p5).toBe(0);
    expect(debut.p95).toBe(0);
    expect(debut.invested).toBe(0);

    // Dès le premier mois, le versement rend toutes les valeurs positives —
    // condition nécessaire pour que l'échelle logarithmique reste traçable.
    expect(result.points[1].p5).toBeGreaterThan(0);

    expect(result.totalInvested).toBeCloseTo(500 * 240, 6);
    expect(result.terminal.p50).toBeGreaterThan(result.totalInvested);
  });

  it("refuse une projection sans aucun apport", () => {
    expect(() =>
      runProjection(
        syntheticReturns(240, 0.005, 0.02),
        baseConfig({ initialAmount: 0, monthlyContribution: 0 }),
      ),
    ).toThrow(ProjectionError);
  });

  it("ne dépend plus de la valeur finale du backtest", () => {
    // Deux appels identiques hormis le capital de départ : le résultat doit
    // varier avec ce paramètre et lui seul, sans référence implicite au passé.
    const history = syntheticReturns(240, 0.005, 0.02);
    const commun = { monthlyContribution: 500, years: 10, expectedAnnualReturn: 0.07, expectedInflation: 0 };

    const sansCapital = runProjection(history, baseConfig({ ...commun, initialAmount: 0 }));
    const avecCapital = runProjection(history, baseConfig({ ...commun, initialAmount: 50_000 }));

    expect(sansCapital.totalInvested).toBeCloseTo(500 * 120, 6);
    expect(avecCapital.totalInvested).toBeCloseTo(50_000 + 500 * 120, 6);
    expect(avecCapital.terminal.p50).toBeGreaterThan(sansCapital.terminal.p50);
  });
})
