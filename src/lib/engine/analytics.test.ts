import { describe, expect, it } from "vitest";

import { weekdays } from "@/test/fixtures/series";
import {
  buildAnnualReturns,
  buildCorrelationMatrix,
  buildRollingReturns,
} from "./analytics";

/** 400 jours ouvrés à partir du 1er janvier 2020 : un peu plus de dix-huit mois. */
const CALENDAR = weekdays("2020-01-01", 400);

describe("matrice de corrélation", () => {
  it("place des 1 sur la diagonale et reste symétrique", () => {
    const assets = [
      { id: "A", label: "A", eurPrices: CALENDAR.map((_, i) => 100 + i) },
      {
        id: "B",
        label: "B",
        eurPrices: CALENDAR.map((_, i) => 100 + Math.sin(i / 9) * 20),
      },
      {
        id: "C",
        label: "C",
        eurPrices: CALENDAR.map((_, i) => 100 + Math.cos(i / 5) * 12),
      },
    ];

    const result = buildCorrelationMatrix(assets, CALENDAR)!;

    expect(result.assetIds).toEqual(["A", "B", "C"]);
    for (let i = 0; i < 3; i += 1) {
      expect(result.matrix[i][i]).toBeCloseTo(1, 9);
      for (let j = 0; j < 3; j += 1) {
        expect(result.matrix[i][j]).toBeCloseTo(result.matrix[j][i], 9);
      }
    }
  });

  it("détecte deux actifs parfaitement opposés", () => {
    // B est construit pour varier exactement à l'inverse de A d'un mois sur
    // l'autre : la corrélation mensuelle doit valoir −1.
    const a = CALENDAR.map((_, i) => 100 * Math.pow(1.01, i % 40));
    const b = a.map((price) => 10_000 / price);

    const result = buildCorrelationMatrix(
      [
        { id: "A", label: "A", eurPrices: a },
        { id: "B", label: "B", eurPrices: b },
      ],
      CALENDAR,
    )!;

    expect(result.matrix[0][1]).toBeLessThan(-0.95);
  });

  it("ne produit pas de matrice pour un actif seul", () => {
    expect(
      buildCorrelationMatrix(
        [{ id: "A", label: "A", eurPrices: CALENDAR.map(() => 100) }],
        CALENDAR,
      ),
    ).toBeNull();
  });

  it("compte une observation par mois, moins celui de départ", () => {
    const result = buildCorrelationMatrix(
      [
        { id: "A", label: "A", eurPrices: CALENDAR.map((_, i) => 100 + i) },
        { id: "B", label: "B", eurPrices: CALENDAR.map((_, i) => 200 - i / 2) },
      ],
      CALENDAR,
    )!;

    const months = new Set(CALENDAR.map((d) => d.slice(0, 7))).size;
    expect(result.observations).toBe(months - 1);
  });
});

describe("rendements annuels", () => {
  it("découpe par année civile", () => {
    const calendar = [
      ...weekdays("2020-11-02", 40),
      ...weekdays("2021-01-04", 40),
    ];
    // +10 % sur 2020, puis +20 % sur 2021.
    const index = calendar.map((date, i) =>
      date.startsWith("2020") ? 1 + (0.1 * i) / 39 : 1.1 * (1 + (0.2 * (i - 40)) / 39),
    );

    const years = buildAnnualReturns(index, calendar);

    expect(years.map((y) => y.period)).toEqual(["2020", "2021"]);
    expect(years[0].return).toBeCloseTo(0.1, 6);
    expect(years[1].return).toBeCloseTo(0.2, 6);
  });
});

describe("rendements glissants", () => {
  it("laisse les fenêtres indéterminées tant qu'elles ne sont pas couvertes", () => {
    const index = CALENDAR.map((_, i) => Math.pow(1.0004, i));
    const points = buildRollingReturns(index, CALENDAR);

    // La série couvre environ dix-huit mois : la fenêtre à un an finit par
    // exister, celles à trois et cinq ans jamais.
    expect(points.at(-1)!.oneYear).not.toBeNull();
    expect(points.at(-1)!.threeYear).toBeNull();
    expect(points.at(-1)!.fiveYear).toBeNull();
    expect(points[0].oneYear).toBeNull();
  });

  it("annualise correctement une croissance constante", () => {
    // Croissance de 10 % par an exactement, à composition quotidienne.
    const calendar = weekdays("2015-01-01", 261 * 6);
    const index = calendar.map((date) => {
      const years =
        (new Date(`${date}T00:00:00Z`).getTime() -
          new Date(`${calendar[0]}T00:00:00Z`).getTime()) /
        (365.25 * 86_400_000);
      return Math.pow(1.1, years);
    });

    const points = buildRollingReturns(index, calendar);
    const last = points.at(-1)!;

    expect(last.oneYear).toBeCloseTo(0.1, 3);
    expect(last.threeYear).toBeCloseTo(0.1, 3);
    expect(last.fiveYear).toBeCloseTo(0.1, 3);
  });

  it("produit un point par mois", () => {
    const index = CALENDAR.map(() => 1);
    const points = buildRollingReturns(index, CALENDAR);
    const months = new Set(CALENDAR.map((d) => d.slice(0, 7))).size;

    expect(points).toHaveLength(months);
  });
});
