import { describe, expect, it } from "vitest";

import {
  BRICKS,
  CORE_OPTIONS,
  DEFAULT_ALLOCATION,
  expandAllocation,
  isAvailable,
} from "./blocks";

const totalOf = (lines: { weightPercent: number }[]) =>
  lines.reduce((sum, line) => sum + line.weightPercent, 0);

describe("développement d'une allocation", () => {
  it("place tout sur le socle quand aucun complément n'est demandé", () => {
    const lines = expandAllocation(DEFAULT_ALLOCATION);

    expect(lines).toHaveLength(1);
    expect(lines[0].ticker).toBe("DCAM.PA");
    expect(lines[0].weightPercent).toBeCloseTo(100, 6);
  });

  it("prélève les compléments sur le socle, pas en plus", () => {
    // Ajouter 15 % d'émergents ne crée pas d'argent : le socle descend d'autant.
    const lines = expandAllocation({
      envelope: "pea",
      coreId: "world",
      satellites: { emerging: 15 },
    });

    expect(totalOf(lines)).toBeCloseTo(100, 6);
    expect(lines.find((l) => l.ticker === "DCAM.PA")!.weightPercent).toBeCloseTo(85, 6);
    expect(lines.find((l) => l.ticker === "PAEEM.PA")!.weightPercent).toBeCloseTo(15, 6);
  });

  it("répartit le socle « séparé » selon ses parts internes", () => {
    // 60/40 sur un socle ramené à 80 % par un complément : 48 % et 32 %.
    const lines = expandAllocation({
      envelope: "cto",
      coreId: "split",
      satellites: { small: 20 },
    });

    expect(lines.find((l) => l.ticker === "PE500.PA")!.weightPercent).toBeCloseTo(48, 6);
    expect(lines.find((l) => l.ticker === "EXUS.DE")!.weightPercent).toBeCloseTo(32, 6);
    expect(totalOf(lines)).toBeCloseTo(100, 6);
  });

  it("reconstitue le monde hors États-Unis au PEA, faute d'ETF dédié", () => {
    // Aucun ETF « monde hors USA » n'est éligible au PEA : le socle séparé y
    // passe par l'Europe et le Japon.
    expect(isAvailable("exUs", "pea")).toBe(false);

    const lines = expandAllocation({
      envelope: "pea",
      coreId: "split",
      satellites: {},
    });

    expect(lines.map((l) => l.ticker).sort()).toEqual([
      "MEUD.PA",
      "PE500.PA",
      "PTPXE.PA",
    ]);
    expect(totalOf(lines)).toBeCloseTo(100, 6);
  });

  it("ignore un complément indisponible dans l'enveloppe choisie", () => {
    // Les petites capitalisations n'existent pas au PEA : demander 10 % ne doit
    // ni planter, ni créer une ligne fantôme, ni faire disparaître 10 % du
    // portefeuille.
    const lines = expandAllocation({
      envelope: "pea",
      coreId: "world",
      satellites: { small: 10 },
    });

    expect(lines).toHaveLength(1);
    expect(totalOf(lines)).toBeCloseTo(100, 6);
  });

  it("fusionne deux briques qui retombent sur le même support", () => {
    // Socle séparé au PEA (Europe 27 % du socle) plus un complément Europe :
    // une seule ligne MEUD, et non deux lignes du même ETF.
    const lines = expandAllocation({
      envelope: "pea",
      coreId: "split",
      satellites: { europe: 20 },
    });

    const europe = lines.filter((l) => l.ticker === "MEUD.PA");
    expect(europe).toHaveLength(1);
    // 27 % des 80 % de socle, plus les 20 % de complément.
    expect(europe[0].weightPercent).toBeCloseTo(0.27 * 80 + 20, 6);
    expect(totalOf(lines)).toBeCloseTo(100, 6);
  });

  it("ne laisse jamais le socle passer sous zéro", () => {
    const lines = expandAllocation({
      envelope: "cto",
      coreId: "world",
      satellites: { emerging: 60, small: 30, europe: 30 },
    });

    expect(lines.every((l) => l.weightPercent > 0)).toBe(true);
    expect(lines.some((l) => l.ticker === "IWDA.AS")).toBe(false);
  });

  it("n'expose que des socles constructibles dans leur enveloppe", () => {
    for (const core of CORE_OPTIONS) {
      for (const envelope of core.envelopes) {
        const lines = expandAllocation({
          envelope,
          coreId: core.id,
          satellites: {},
        });
        expect(totalOf(lines)).toBeCloseTo(100, 6);
      }
    }
  });

  it("ne référence que des tickers réellement présents au catalogue", () => {
    // Le parcours crée la stratégie à partir de ces tickers : une faute de
    // frappe ici ne se verrait qu'au moment de l'échec de création.
    const tickers = Object.values(BRICKS)
      .flatMap((brick) => Object.values(brick.ticker))
      .filter((ticker): ticker is string => ticker !== null);

    expect(new Set(tickers).size).toBeGreaterThan(0);
    for (const ticker of tickers) {
      expect(ticker).toMatch(/^[A-Z0-9]+(\.[A-Z]{2})?$/);
    }
  });
});
