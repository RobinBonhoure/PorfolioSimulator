import { describe, expect, it } from "vitest";

import { despike } from "./despike";
import type { IsoDate, PricePoint } from "./types";

/**
 * Les séries de ces tests sont des relevés réels du catalogue, pas des cas
 * inventés : c'est la seule façon de vérifier que le filtre attrape ce qu'il
 * doit et laisse passer les vraies séances violentes.
 */

const series = (...closes: number[]): PricePoint[] =>
  closes.map((close, i) => ({
    // Dates ouvrées fictives mais ordonnées : le filtre ne regarde que l'ordre.
    date: `2025-01-${String(i + 1).padStart(2, "0")}` as IsoDate,
    close,
  }));

describe("retrait des cotations aberrantes", () => {
  it("écarte le pic de EXUS.DE du 24 octobre 2025", () => {
    // Relevés réels : +16,1 % puis −13,4 %, la veille et le lendemain au même
    // niveau (34,125 et 34,325).
    const result = despike(
      series(34.11, 34.01, 34.125, 39.625, 34.325, 34.365, 34.33),
    );

    expect(result.removed).toHaveLength(1);
    expect(result.points.map((p) => p.close)).not.toContain(39.625);
    expect(result.points).toHaveLength(6);
  });

  it("écarte le pic de IJPA.AS du même jour", () => {
    const result = despike(
      series(58.495, 58.175, 58.185, 67.671, 58.955, 58.96, 58.7),
    );

    expect(result.removed).toHaveLength(1);
    expect(result.points.map((p) => p.close)).not.toContain(67.671);
  });

  it("conserve le bond réel de EEM en octobre 2008", () => {
    // +22,8 % le 13 octobre 2008, suivi de −5 % : le marché ne revient pas au
    // point de départ, le mouvement s'installe. C'est un vrai krach, pas un
    // relevé faux.
    const result = despike(series(16.84, 20.67, 19.64, 16.47, 16.9));

    expect(result.removed).toEqual([]);
    expect(result.points).toHaveLength(5);
  });

  it("conserve le bond réel de QQQ du 3 janvier 2001", () => {
    // +16,8 % sur la baisse surprise des taux de la Fed. Le niveau tient.
    const result = despike(series(45.03, 52.61, 51.2, 50.8, 52.0));

    expect(result.removed).toEqual([]);
  });

  it("conserve un décalage durable, qui relève de la donnée curatée", () => {
    // Division d'actions non ajustée, comme IJPA.AS le 13 octobre 2009 : le
    // niveau change et ne revient pas. Ce filtre doit le laisser passer — il se
    // traite par `priceHistoryFrom`, pas en écartant un point.
    const result = despike(series(24.4, 24.405, 16.45, 16.49, 16.35));

    expect(result.removed).toEqual([]);
  });

  it("ne juge ni le premier ni le dernier point", () => {
    // Aux deux extrémités il manque un voisin, donc la preuve du retour. Un
    // relevé douteux y est conservé : retirer sur une demi-preuve reviendrait à
    // amputer une série de son début ou de sa fin sur une présomption.
    const debut = despike(series(50, 100, 101, 102));
    expect(debut.removed).toEqual([]);
    expect(debut.points[0].close).toBe(50);

    const fin = despike(series(100, 101, 102, 50));
    expect(fin.removed).toEqual([]);
    expect(fin.points.at(-1)!.close).toBe(50);

    // En revanche un point intérieur est bien jugé, même sur une série de trois.
    expect(despike(series(100, 50, 100)).removed).toHaveLength(1);
  });

  it("ne propage pas l'erreur quand deux relevés faux se suivent", () => {
    // Le second pic est comparé au dernier point conservé (100), pas au premier
    // pic déjà écarté.
    const result = despike(series(100, 100.5, 130, 100.2, 131, 100.4, 100.6));

    expect(result.removed).toHaveLength(2);
    expect(result.points.every((p) => p.close < 110)).toBe(true);
  });

  it("laisse intacte une série sans anomalie", () => {
    const clean = series(100, 101, 99.5, 102, 103, 101.5);
    const result = despike(clean);

    expect(result.points).toEqual(clean);
    expect(result.removed).toEqual([]);
  });

  it("supporte les séries trop courtes pour conclure", () => {
    expect(despike([]).points).toEqual([]);
    expect(despike(series(100, 200)).points).toHaveLength(2);
  });
});
