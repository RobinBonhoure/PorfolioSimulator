import { describe, expect, it } from "vitest";

import { weekdays } from "@/test/fixtures/series";
import {
  annualizedVolatility,
  bestAndWorst,
  correlation,
  cumulativeIndex,
  maxDrawdown,
  monthlyReturns,
  sortinoRatio,
  standardDeviation,
  timeWeightedReturns,
  underwaterCurve,
  yearlyReturns,
} from "./metrics";

describe("maxDrawdown", () => {
  it("mesure une baisse connue et date ses trois étapes", () => {
    // Trajectoire construite à la main : 100 → 120 (pic) → 60 (creux, −50 %)
    // → 120 (retour au pic) → 130.
    const index = [100, 110, 120, 90, 60, 80, 120, 130];
    const calendar = weekdays("2020-01-01", index.length);

    const result = maxDrawdown(index, calendar);

    expect(result.maxDrawdown).toBeCloseTo(-0.5, 9);
    expect(result.peakDate).toBe(calendar[2]);
    expect(result.troughDate).toBe(calendar[4]);
    expect(result.recoveryDate).toBe(calendar[6]);
    expect(result.recoveryDays).toBeGreaterThan(0);
  });

  it("laisse la récupération indéterminée quand le pic n'est jamais repris", () => {
    const index = [100, 120, 60, 80, 90];
    const calendar = weekdays("2020-01-01", index.length);

    const result = maxDrawdown(index, calendar);

    expect(result.maxDrawdown).toBeCloseTo(-0.5, 9);
    expect(result.recoveryDate).toBeNull();
    expect(result.recoveryDays).toBeNull();
  });

  it("retient la baisse la plus profonde et non la plus récente", () => {
    // Une chute de 40 % suivie d'une chute de 20 % : c'est la première qui compte.
    const index = [100, 60, 100, 80, 100];
    const calendar = weekdays("2020-01-01", index.length);

    expect(maxDrawdown(index, calendar).maxDrawdown).toBeCloseTo(-0.4, 9);
  });

  it("ne voit aucune baisse dans une série strictement croissante", () => {
    const index = [100, 101, 102, 103];
    const calendar = weekdays("2020-01-01", index.length);

    expect(maxDrawdown(index, calendar).maxDrawdown).toBe(0);
  });
});

describe("underwaterCurve", () => {
  it("vaut zéro sur les sommets et l'écart au sommet ailleurs", () => {
    const curve = underwaterCurve([100, 120, 60, 120, 150]);

    expect(curve[0]).toBe(0);
    expect(curve[1]).toBe(0);
    expect(curve[2]).toBeCloseTo(-0.5, 9);
    expect(curve[3]).toBeCloseTo(0, 9);
    expect(curve[4]).toBe(0);
  });
});

describe("timeWeightedReturns", () => {
  it("ignore l'apport d'argent frais", () => {
    // La valeur passe de 100 à 210, mais 100 viennent d'un versement :
    // la performance réelle est de +10 %.
    const returns = timeWeightedReturns([100, 210], [0, 100]);

    expect(returns).toHaveLength(1);
    expect(returns[0]).toBeCloseTo(0.1, 9);
  });

  it("retrouve la performance brute en l'absence de versement", () => {
    const returns = timeWeightedReturns([100, 110, 99], [0, 0, 0]);

    expect(returns[0]).toBeCloseTo(0.1, 9);
    expect(returns[1]).toBeCloseTo(-0.1, 9);
  });
});

describe("cumulativeIndex", () => {
  it("chaîne les rendements de façon géométrique", () => {
    // +10 % puis −10 % ne ramène pas à l'origine : 1,1 × 0,9 = 0,99.
    const index = cumulativeIndex([0.1, -0.1]);

    expect(index).toHaveLength(3);
    expect(index[2]).toBeCloseTo(0.99, 9);
  });
});

describe("standardDeviation et volatilité", () => {
  it("vaut zéro sur une série constante", () => {
    expect(standardDeviation([0.01, 0.01, 0.01])).toBe(0);
    expect(annualizedVolatility([0.01, 0.01, 0.01])).toBe(0);
  });

  it("annualise en racine du nombre de séances", () => {
    // Écart-type quotidien de 1 % → volatilité annuelle de 1 % × √252 ≈ 15,87 %.
    const returns = Array.from({ length: 1_000 }, (_, i) =>
      i % 2 === 0 ? 0.01 : -0.01,
    );
    const dailySigma = standardDeviation(returns);

    expect(annualizedVolatility(returns)).toBeCloseTo(
      dailySigma * Math.sqrt(252),
      9,
    );
  });
});

describe("rendements par période", () => {
  it("découpe l'indice par mois calendaire", () => {
    // Trois mois de vingt jours ouvrés, chacun progressant de 10 %.
    const calendar = weekdays("2021-01-01", 60);
    const index = calendar.map((_, i) => Math.pow(1.1, Math.floor(i / 20)));

    const months = monthlyReturns(index, calendar);

    expect(months.length).toBeGreaterThanOrEqual(3);
    expect(months.map((m) => m.period)).toContain("2021-01");
  });

  it("identifie la meilleure et la pire période", () => {
    const periods = [
      { period: "2020", return: 0.2 },
      { period: "2021", return: -0.35 },
      { period: "2022", return: 0.05 },
    ];

    const { best, worst } = bestAndWorst(periods);

    expect(best?.period).toBe("2020");
    expect(worst?.period).toBe("2021");
  });

  it("regroupe correctement par année", () => {
    const calendar = [...weekdays("2020-12-28", 4), ...weekdays("2021-01-04", 4)];
    const index = calendar.map((_, i) => 100 + i);

    const years = yearlyReturns(index, calendar);

    expect(years.map((y) => y.period)).toEqual(["2020", "2021"]);
  });
});

describe("sortinoRatio", () => {
  it("ignore la volatilité haussière", () => {
    // Deux séries qui baissent toutes deux sous le seuil, mais l'une plus
    // profondément : celle qui baisse le moins doit obtenir un meilleur Sortino
    // à rendement annuel identique.
    const shallowDips = Array.from({ length: 500 }, (_, i) =>
      i % 2 === 0 ? 0.003 : -0.0005,
    );
    const deepDips = Array.from({ length: 500 }, (_, i) =>
      i % 2 === 0 ? 0.006 : -0.004,
    );

    const a = sortinoRatio(shallowDips, 0.1, 0.02)!;
    const b = sortinoRatio(deepDips, 0.1, 0.02)!;

    expect(a).toBeGreaterThan(b);
  });

  it("n'est pas défini quand aucune séance ne passe sous le seuil", () => {
    // Un ratio de zéro ferait passer un portefeuille sans risque baissier pour
    // le pire du lot : l'absence de valeur est la réponse honnête.
    const neverBelowTarget = new Array(300).fill(0.002);

    expect(sortinoRatio(neverBelowTarget, 0.1, 0.02)).toBeNull();
  });
});

describe("correlation", () => {
  it("vaut 1 pour deux séries identiques", () => {
    const a = [0.01, -0.02, 0.03, -0.01, 0.005];
    expect(correlation(a, a)).toBeCloseTo(1, 9);
  });

  it("vaut −1 pour deux séries opposées", () => {
    const a = [0.01, -0.02, 0.03, -0.01, 0.005];
    const b = a.map((x) => -x);
    expect(correlation(a, b)).toBeCloseTo(-1, 9);
  });

  it("vaut 0 quand une série est constante", () => {
    const a = [0.01, -0.02, 0.03];
    const b = [0.01, 0.01, 0.01];
    expect(correlation(a, b)).toBe(0);
  });
});
