import { describe, expect, it } from "vitest";

import type { ResultAssetInfo } from "./run-for-strategy";
import {
  UNKNOWN_CATEGORY,
  capBreakdown,
  collapseTail,
  equityShareOf,
  geoBreakdown,
  sectorBreakdown,
} from "./breakdowns";

const asset = (
  id: string,
  targetWeight: number,
  sector: Record<string, number> | null,
  geo: Record<string, number> | null = null,
  extra: Partial<ResultAssetInfo> = {},
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
  capBreakdown: null,
  assetClass: "equity",
  trackedIndex: null,
  dataPartial: sector === null,
  ...extra,
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

describe("répartition par taille de capitalisation", () => {
  const equity = (
    id: string,
    weight: number,
    cap: Record<string, number> | null,
  ) => asset(id, weight, { Technologie: 100 }, null, { capBreakdown: cap });

  const bond = (id: string, weight: number) =>
    asset(id, weight, null, null, { assetClass: "bond" });

  it("ignore les actifs sans capitalisation plutôt que de les compter absents", () => {
    // 60 % d'actions entièrement en grandes capitalisations, 40 % d'obligations.
    // La poche actions est intégralement documentée : la répartition doit dire
    // « 100 % de grandes », et non « 60 % de grandes, 40 % non renseigné ».
    const slices = capBreakdown([
      equity("actions", 0.6, { Grandes: 100 }),
      bond("obligations", 0.4),
    ]);

    expect(slices).toHaveLength(1);
    expect(slices[0].category).toBe("Grandes");
    expect(slices[0].percent).toBeCloseTo(100, 6);
  });

  it("compte en « non renseigné » une action dont la taille est inconnue", () => {
    // Ici l'information manque vraiment : l'actif est bien une action, mais
    // ajouté hors catalogue. C'est le cas que la restriction ne doit pas avaler.
    const slices = capBreakdown([
      equity("connu", 0.5, { Grandes: 100 }),
      equity("inconnu", 0.5, null),
    ]);

    const unknown = slices.find((s) => s.category === UNKNOWN_CATEGORY)!;
    expect(unknown.percent).toBeCloseTo(50, 6);
  });

  it("pondère les tailles par le poids relatif au sein de la poche actions", () => {
    // Actions : 30 % de grandes + 10 % de petites, soit 40 % du portefeuille.
    // Rapporté à la poche actions seule : 75 % / 25 %.
    const slices = capBreakdown([
      equity("large", 0.3, { Grandes: 100 }),
      equity("small", 0.1, { Petites: 100 }),
      bond("obligations", 0.6),
    ]);

    expect(slices.find((s) => s.category === "Grandes")!.percent).toBeCloseTo(75, 6);
    expect(slices.find((s) => s.category === "Petites")!.percent).toBeCloseTo(25, 6);
  });

  it("ordonne de la plus grosse taille à la plus petite, pas par poids", () => {
    const slices = capBreakdown([
      equity("small", 0.9, { Petites: 100 }),
      equity("large", 0.1, { Grandes: 100 }),
    ]);

    // « Petites » pèse neuf fois plus, mais l'échelle reste dans son ordre.
    expect(slices.map((s) => s.category)).toEqual(["Grandes", "Petites"]);
  });

  it("ne renvoie rien pour un portefeuille sans actions", () => {
    expect(capBreakdown([bond("a", 0.5), bond("b", 0.5)])).toEqual([]);
  });

  it("mesure la part actions du portefeuille", () => {
    expect(
      equityShareOf([equity("a", 0.35, { Grandes: 100 }), bond("b", 0.65)]),
    ).toBeCloseTo(35, 6);
  });
});

describe("regroupement de la traîne", () => {
  const slice = (category: string, percent: number) => ({ category, percent });

  it("fusionne le reliquat avec une catégorie « Autres » déjà présente", () => {
    // Cas réel d'un ETF monde : sa décomposition géographique se termine déjà
    // par « Autres ». Deux entrées du même nom rendaient la légende illisible.
    const collapsed = collapseTail(
      [
        slice("États-Unis", 60),
        slice("Autres", 17),
        slice("Japon", 8),
        slice("Canada", 6),
        slice("France", 5),
        slice("Suisse", 4),
      ],
      4,
    );

    const others = collapsed.filter((s) => s.category === "Autres");
    expect(others).toHaveLength(1);
    // 17 déjà présents, plus Canada 6, France 5 et Suisse 4 rabattus dedans.
    expect(others[0].percent).toBeCloseTo(32, 6);
    // Le total est conservé : rien n'est perdu ni compté deux fois.
    expect(collapsed.reduce((sum, s) => sum + s.percent, 0)).toBeCloseTo(100, 6);
  });

  it("place le reliquat en dernier, même après fusion", () => {
    const collapsed = collapseTail(
      [slice("Autres", 50), slice("A", 30), slice("B", 12), slice("C", 8)],
      3,
    );

    expect(collapsed[collapsed.length - 1].category).toBe("Autres");
  });

  it("laisse une liste courte intacte", () => {
    const input = [slice("A", 60), slice("Autres", 40)];
    expect(collapseTail(input, 8)).toEqual(input);
  });
});
