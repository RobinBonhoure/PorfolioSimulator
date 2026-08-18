import { describe, expect, it } from "vitest";

import type { ResultAssetInfo } from "./run-for-strategy";
import {
  UNKNOWN_CATEGORY,
  collapseTail,
  geoBreakdown,
  sectorBreakdown,
} from "./breakdowns";

const asset = (
  id: string,
  targetWeight: number,
  sector: Record<string, number> | null,
  geo: Record<string, number> | null = null,
): ResultAssetInfo => ({
  id,
  label: id,
  name: id,
  ticker: id,
  type: "etf",
  peaEligible: true,
  ter: null,
  targetWeight,
  sectorBreakdown: sector,
  geoBreakdown: geo,
  dataPartial: sector === null,
});

describe("agrégation des répartitions", () => {
  it("pondère la décomposition de chaque actif par son poids", () => {
    // 60 % d'un actif à 50 % de technologie, plus 40 % d'un actif à 100 % de
    // technologie : 30 + 40 = 70 points de technologie.
    const slices = sectorBreakdown([
      asset("A", 0.6, { Technologie: 50, Finance: 50 }),
      asset("B", 0.4, { Technologie: 100 }),
    ]);

    const tech = slices.find((s) => s.category === "Technologie")!;
    const finance = slices.find((s) => s.category === "Finance")!;

    expect(tech.percent).toBeCloseTo(70, 9);
    expect(finance.percent).toBeCloseTo(30, 9);
  });

  it("somme toujours à 100 %", () => {
    const slices = sectorBreakdown([
      asset("A", 0.5, { Technologie: 24.5, Santé: 12.5, Finance: 63 }),
      asset("B", 0.3, { Énergie: 100 }),
      asset("C", 0.2, { Technologie: 40, Industrie: 60 }),
    ]);

    const total = slices.reduce((sum, s) => sum + s.percent, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("isole les actifs sans décomposition au lieu de les exclure", () => {
    // Exclure l'actif inconnu renormaliserait le reste à 100 % et présenterait
    // une répartition complète là où un tiers du portefeuille est en réalité
    // non documenté.
    const slices = sectorBreakdown([
      asset("Connu", 0.7, { Technologie: 100 }),
      asset("Inconnu", 0.3, null),
    ]);

    const unknown = slices.find((s) => s.category === UNKNOWN_CATEGORY)!;
    expect(unknown.percent).toBeCloseTo(30, 9);
    expect(slices.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);
  });

  it("place la catégorie inconnue en dernier même quand elle domine", () => {
    const slices = sectorBreakdown([
      asset("Connu", 0.1, { Technologie: 100 }),
      asset("Inconnu", 0.9, null),
    ]);

    expect(slices.at(-1)!.category).toBe(UNKNOWN_CATEGORY);
  });

  it("renormalise une décomposition qui ne somme pas exactement à 100", () => {
    // Les décompositions curatées sont arrondies : 99 ou 101 ne doivent pas se
    // propager en écart sur le total du portefeuille.
    const slices = sectorBreakdown([
      asset("A", 1, { Technologie: 60, Finance: 39 }),
    ]);

    expect(slices.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);
  });

  it("agrège la géographie indépendamment du secteur", () => {
    const slices = geoBreakdown([
      asset("A", 0.5, { Technologie: 100 }, { "États-Unis": 100 }),
      asset("B", 0.5, { Finance: 100 }, { France: 100 }),
    ]);

    expect(slices).toHaveLength(2);
    expect(slices[0].percent).toBeCloseTo(50, 9);
  });
});

describe("regroupement de la traîne", () => {
  it("laisse intactes les listes courtes", () => {
    const slices = [
      { category: "A", percent: 60 },
      { category: "B", percent: 40 },
    ];
    expect(collapseTail(slices)).toHaveLength(2);
  });

  it("rassemble le reliquat sans perdre de pourcentage", () => {
    const slices = Array.from({ length: 12 }, (_, i) => ({
      category: `C${i}`,
      percent: 100 / 12,
    }));

    const collapsed = collapseTail(slices, 5);

    expect(collapsed).toHaveLength(5);
    expect(collapsed.at(-1)!.category).toBe("Autres");
    expect(collapsed.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);
  });
});
