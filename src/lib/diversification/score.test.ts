import { describe, expect, it } from "vitest";

import { analyseDiversification } from "./score";
import { pairOverlap, worstOverlap } from "./overlap";
import type { DiversifiableHolding } from "./types";

/**
 * Les allocations de référence de ces tests sont celles qu'on rencontre
 * réellement : un ETF monde seul, le doublon monde + S&P 500, et la version
 * corrigée. Chaque attente est vérifiable à la main depuis les décompositions
 * ci-dessous et les bornes de `axes.ts`.
 */

const MSCI_WORLD_GEO = {
  "États-Unis": 72,
  Japon: 5.5,
  "Royaume-Uni": 3.7,
  Canada: 3.2,
  France: 2.7,
  Suisse: 2.5,
  Allemagne: 2.4,
  Australie: 1.7,
  "Pays-Bas": 1.2,
  Autres: 5.1,
};

const MSCI_WORLD_SECTORS = {
  Technologie: 26,
  Finance: 16,
  Industrie: 11,
  Santé: 10,
  "Consommation discrétionnaire": 10,
  Communication: 9,
  "Consommation de base": 6,
  Énergie: 4,
  Matériaux: 3,
  "Services aux collectivités": 3,
  Immobilier: 2,
};

const SP500_SECTORS = {
  Technologie: 32,
  Finance: 14,
  Santé: 10,
  "Consommation discrétionnaire": 10,
  Communication: 9,
  Industrie: 8,
  "Consommation de base": 6,
  Énergie: 3,
  Matériaux: 3,
  "Services aux collectivités": 3,
  Immobilier: 2,
};

const EM_GEO = {
  Chine: 27,
  Inde: 19,
  Taïwan: 19,
  "Corée du Sud": 10,
  Brésil: 4,
  "Arabie saoudite": 4,
  "Afrique du Sud": 3,
  Mexique: 2,
  Autres: 12,
};

const EM_SECTORS = {
  Technologie: 24,
  Finance: 22,
  "Consommation discrétionnaire": 13,
  Communication: 10,
  Industrie: 7,
  Matériaux: 6,
  "Consommation de base": 5,
  Énergie: 5,
  Santé: 3,
  "Services aux collectivités": 3,
  Immobilier: 2,
};

const SMALL_GEO = {
  "États-Unis": 60,
  Japon: 11,
  "Royaume-Uni": 6,
  Canada: 5,
  Australie: 3,
  Allemagne: 2,
  Autres: 13,
};

const SMALL_SECTORS = {
  Industrie: 21,
  Finance: 17,
  "Consommation discrétionnaire": 14,
  Technologie: 12,
  Santé: 10,
  Immobilier: 8,
  Matériaux: 7,
  "Consommation de base": 5,
  Énergie: 4,
  "Services aux collectivités": 2,
};

const hold = (
  label: string,
  weight: number,
  extra: Partial<DiversifiableHolding> = {},
): DiversifiableHolding => ({
  id: label,
  label,
  weight,
  assetClass: "equity",
  trackedIndex: null,
  ter: null,
  geoBreakdown: null,
  sectorBreakdown: null,
  capBreakdown: null,
  ...extra,
});

const world = (weight: number, label = "MSCI World", ter = 0.002) =>
  hold(label, weight, {
    trackedIndex: "MSCI World",
    ter,
    geoBreakdown: MSCI_WORLD_GEO,
    sectorBreakdown: MSCI_WORLD_SECTORS,
    capBreakdown: { Grandes: 86, Moyennes: 14 },
  });

const sp500 = (weight: number) =>
  hold("S&P 500", weight, {
    trackedIndex: "S&P 500",
    ter: 0.0012,
    geoBreakdown: { "États-Unis": 100 },
    sectorBreakdown: SP500_SECTORS,
    capBreakdown: { Grandes: 100 },
  });

const emerging = (weight: number) =>
  hold("Émergents", weight, {
    trackedIndex: "MSCI Emerging Markets",
    ter: 0.002,
    geoBreakdown: EM_GEO,
    sectorBreakdown: EM_SECTORS,
    capBreakdown: { Grandes: 86, Moyennes: 14 },
  });

const smallCaps = (weight: number) =>
  hold("Petites capitalisations", weight, {
    trackedIndex: "MSCI World Small Cap",
    ter: 0.0035,
    geoBreakdown: SMALL_GEO,
    sectorBreakdown: SMALL_SECTORS,
    capBreakdown: { Petites: 100 },
  });

const bonds = (weight: number) =>
  hold("Obligations d'État €", weight, {
    assetClass: "bond",
    trackedIndex: "Obligations d'État zone euro",
    geoBreakdown: { France: 25, Italie: 23, Allemagne: 20, Espagne: 15, Autres: 17 },
  });

const axisOf = (report: ReturnType<typeof analyseDiversification>, key: string) =>
  report.axes.find((a) => a.key === key)!;

describe("recouvrement entre supports", () => {
  it("détecte un doublon d'indice sans passer par l'estimation", () => {
    // Deux ETF MSCI World de fournisseurs différents : rien à estimer, ils
    // détiennent littéralement le même panier.
    const overlap = pairOverlap(world(0.5), world(0.5, "MSCI World bis", 0.0038));
    expect(overlap).toBe(1);
  });

  it("estime le recouvrement monde / S&P 500 autour de 60 %", () => {
    // Géographie : min(72, 100) = 72 %. Secteurs : somme des minima = 94 %.
    // Tailles : min(86, 100) = 86 %. Produit ≈ 0,72 × 0,94 × 0,86 = 0,58.
    const overlap = pairOverlap(world(0.5), sp500(0.5));
    expect(overlap).toBeCloseTo(0.582, 2);
  });

  it("ne voit aucun recouvrement entre monde et émergents", () => {
    // Les deux zones sont disjointes : seule la catégorie « Autres » se
    // rencontre, à hauteur de 5,1 points.
    const overlap = pairOverlap(world(0.5), emerging(0.5));
    expect(overlap).toBeLessThan(0.05);
  });

  it("ne voit aucun recouvrement entre grandes et petites capitalisations", () => {
    // Zones et secteurs se ressemblent beaucoup, mais les segments de
    // capitalisation sont disjoints par construction : c'est le facteur taille
    // qui empêche de conclure à tort à un doublon.
    expect(pairOverlap(world(0.9), smallCaps(0.1))).toBe(0);
  });

  it("ne compare pas des classes d'actifs différentes", () => {
    // Un ETF actions France et une dette d'État française afficheraient tous
    // deux « France », sans partager la moindre ligne.
    expect(pairOverlap(world(0.6), bonds(0.4))).toBe(0);
  });

  it("pondère la duplication par la plus petite des deux lignes", () => {
    // Recouvrement identique, poids différents : une ligne à 5 % ne met pas le
    // portefeuille en cause. 2 × 0,05 × 0,582 = 5,8 %.
    const small = worstOverlap([world(0.95), sp500(0.05)])!;
    expect(small.duplicated).toBeCloseTo(5.8, 1);

    // À parts égales, la même redondance atteint 58 % du portefeuille.
    const even = worstOverlap([world(0.5), sp500(0.5)])!;
    expect(even.duplicated).toBeCloseTo(58.2, 1);
  });
});

describe("analyse d'une allocation", () => {
  it("note un ETF monde seul : concentré, sans petites valeurs, sans doublon", () => {
    const report = analyseDiversification([world(1)]);

    // 72 % aux États-Unis : au-dessus de la borne 70, donc niveau 2.
    expect(axisOf(report, "geography").value).toBeCloseTo(72, 6);
    expect(axisOf(report, "geography").level).toBe(2);

    // 26 % de technologie : entre 24 et 30, niveau 3.
    expect(axisOf(report, "sector").level).toBe(3);

    // 14 % de moyennes, aucune petite : entre 8 et 15, niveau 2.
    expect(axisOf(report, "size").value).toBeCloseTo(14, 6);
    expect(axisOf(report, "size").level).toBe(2);

    // Une ligne unique n'a rien à recouvrir — zéro, et non « non calculable ».
    expect(axisOf(report, "overlap").value).toBe(0);
    expect(axisOf(report, "overlap").level).toBe(5);
  });

  it("signale le doublon monde + S&P 500 comme le défaut principal", () => {
    const report = analyseDiversification([world(0.5), sp500(0.5)]);

    // 58 % de duplication : niveau 2 sur 5. Le niveau 1 reste réservé au
    // doublon franc — deux ETF du même indice, qui atteignent 100 %.
    expect(axisOf(report, "overlap").level).toBe(2);
    // 86 % aux États-Unis : la seconde ligne n'a fait que renforcer la première.
    expect(axisOf(report, "geography").value).toBeCloseTo(86, 0);
    expect(axisOf(report, "geography").level).toBe(1);

    const first = report.findings[0];
    expect(first.id).toBe("overlap-high");
    expect(first.severity).toBe("high");
    expect(first.action).toBeTruthy();
  });

  it("récompense une allocation réellement diversifiée", () => {
    // Monde 60 %, émergents 20 %, petites capitalisations 20 % : trois
    // expositions disjointes.
    const report = analyseDiversification([
      world(0.6),
      emerging(0.2),
      smallCaps(0.2),
    ]);

    // États-Unis : 0,6 × 72 + 0,2 × 60 = 55,2 %, juste au-dessus de la borne 55.
    expect(axisOf(report, "geography").level).toBe(3);
    // Moyennes et petites : 0,6 × 14 + 0,2 × 14 + 0,2 × 100 = 31,2 %.
    expect(axisOf(report, "size").value).toBeCloseTo(31.2, 1);
    expect(axisOf(report, "size").level).toBe(5);
    expect(axisOf(report, "overlap").level).toBeGreaterThanOrEqual(4);

    expect(report.findings.filter((f) => f.severity === "high")).toHaveLength(0);
  });

  it("nomme le support le moins cher quand deux lignes suivent le même indice", () => {
    const report = analyseDiversification([
      world(0.5, "MSCI World — CW8", 0.0038),
      world(0.5, "MSCI World — DCAM", 0.002),
    ]);

    const doublon = report.findings.find((f) => f.id === "overlap-same-index")!;
    expect(doublon.severity).toBe("high");
    expect(doublon.action).toContain("DCAM");
  });

  it("mesure secteur et taille sur la seule poche actions", () => {
    // 40 % d'actions monde, 60 % d'obligations. La poche actions est
    // intégralement documentée : ses 26 % de technologie doivent être lus tels
    // quels, et non dilués à 10,4 % par la part obligataire.
    const report = analyseDiversification([world(0.4), bonds(0.6)]);

    expect(report.equityShare).toBeCloseTo(40, 6);
    expect(axisOf(report, "sector").value).toBeCloseTo(26, 6);
    expect(axisOf(report, "size").value).toBeCloseTo(14, 6);

    // La géographie, elle, porte bien sur tout : le risque pays d'une dette
    // souveraine est réel. 0,4 × 72 = 28,8 % aux États-Unis.
    expect(axisOf(report, "geography").value).toBeCloseTo(28.8, 1);
  });

  it("laisse la corrélation non calculable tant qu'aucun backtest n'a tourné", () => {
    const report = analyseDiversification([world(0.5), emerging(0.5)]);
    const axis = axisOf(report, "correlation");

    expect(axis.value).toBeNull();
    expect(axis.level).toBeNull();
    expect(axis.detail).toContain("backtest");
  });

  it("intègre la corrélation quand elle est fournie", () => {
    const report = analyseDiversification([world(0.5), sp500(0.5)], {
      correlation: 0.97,
    });

    expect(axisOf(report, "correlation").level).toBe(1);
    expect(report.findings.some((f) => f.id === "correlation-high")).toBe(true);
  });

  it("signale une ligne étroite qui domine le portefeuille", () => {
    const report = analyseDiversification([
      hold("LVMH", 0.7, {
        geoBreakdown: { France: 100 },
        sectorBreakdown: { "Consommation discrétionnaire": 100 },
        capBreakdown: { Grandes: 100 },
      }),
      world(0.3),
    ]);

    const finding = report.findings.find((f) => f.id === "narrow-line-dominant")!;
    expect(finding.severity).toBe("high");
    expect(finding.title).toContain("LVMH");
  });

  it("avertit quand une part du portefeuille échappe au diagnostic", () => {
    const report = analyseDiversification([world(0.8), hold("Actif inconnu", 0.2)]);

    const finding = report.findings.find((f) => f.id === "data-missing")!;
    expect(finding.severity).toBe("info");
    expect(finding.title).toContain("20 %");
    // Une information n'est jamais classée avant un défaut à corriger.
    expect(report.findings[report.findings.length - 1].id).toBe("data-missing");
  });

  it("ne dépend que du rapport des poids, pas de leur somme", () => {
    // Une allocation saisie à 80 % doit être notée comme la même allocation
    // saisie à 100 % : seul le rapport entre les lignes a un sens.
    const partial = analyseDiversification([world(0.4), emerging(0.4)]);
    const full = analyseDiversification([world(0.5), emerging(0.5)]);

    expect(axisOf(partial, "geography").value).toBeCloseTo(
      axisOf(full, "geography").value!,
      6,
    );
    expect(partial.equityShare).toBeCloseTo(100, 6);
  });
});
