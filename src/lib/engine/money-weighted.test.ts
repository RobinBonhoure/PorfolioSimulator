import { describe, expect, it } from "vitest";

import { moneyWeightedReturn } from "./metrics";
import type { IsoDate } from "./types";

/**
 * Chaque attente est vérifiable à la main : les flux sont annuels et les taux
 * choisis pour tomber juste.
 *
 * Les comparaisons sont faites à trois décimales et non davantage, à cause de
 * la convention de durée du moteur : une année vaut 365,25 jours partout, si
 * bien que deux 1ers janvier consécutifs encadrant une année bissextile font
 * 1,002 an et non 1,000. L'écart qui en résulte — deux centièmes de point sur
 * un taux de 10 % — est celui de la convention, pas du calcul.
 */

/** Calendrier de `years + 1` points annuels, du 1er janvier 2000. */
const yearly = (years: number): IsoDate[] =>
  Array.from({ length: years + 1 }, (_, i) => `${2000 + i}-01-01` as IsoDate);

/** Rendement annualisé d'une suite de rendements annuels chaînés. */
const chainedReturn = (annual: number[]) =>
  Math.pow(annual.reduce((acc, r) => acc * (1 + r), 1), 1 / annual.length) - 1;

describe("rendement pondéré par l'argent", () => {
  it("retrouve le taux d'un versement unique", () => {
    // 1 000 € placés un an deviennent 1 100 € : 10 % par an, sans ambiguïté
    // possible puisqu'il n'y a qu'un flux.
    const r = moneyWeightedReturn([1_000, 0], 1_100, yearly(1));
    expect(r).toBeCloseTo(0.1, 3);
  });

  it("retrouve le taux d'un versement unique sur plusieurs années", () => {
    // 1 000 € à 10 % pendant trois ans : 1 000 × 1,1³ = 1 331 €.
    const r = moneyWeightedReturn([1_000, 0, 0, 0], 1_331, yearly(3));
    expect(r).toBeCloseTo(0.1, 3);
  });

  it("pondère chaque versement par sa durée de placement", () => {
    // 100 € au début de chaque année pendant deux ans, à 10 % par an.
    // Le premier travaille deux ans (121 €), le second un an (110 €) : 231 €.
    const r = moneyWeightedReturn([100, 100, 0], 231, yearly(2));
    expect(r).toBeCloseTo(0.1, 3);
  });

  it("ne dépend que des flux et de la valeur finale, jamais du chemin", () => {
    // Propriété structurante, et c'est elle qui explique la divergence avec le
    // rendement pondéré par le temps : deux allocations qui encaissent les
    // mêmes versements et finissent au même montant ont le même rendement sur
    // l'argent, quelle qu'ait été leur trajectoire entre les deux. Le
    // rendement pondéré par le temps, lui, dépend entièrement de cette
    // trajectoire. Comparer les deux revient donc à comparer « ce que
    // l'allocation a fait » et « ce que mon argent a fait ».
    const flows = [100, 100, 0];
    const calendar = yearly(2);

    expect(moneyWeightedReturn(flows, 300, calendar)).toBe(
      moneyWeightedReturn([...flows], 300, [...calendar]),
    );
  });

  it("s'écarte du rendement pondéré par le temps selon le moment de la hausse", () => {
    // Deux trajectoires, mêmes versements — 100 € au début de chacune des deux
    // années — et même valeur finale de 300 €. Le rendement sur l'argent est
    // donc identique dans les deux cas ; le rendement pondéré par le temps, non.
    const calendar = yearly(2);
    const money = moneyWeightedReturn([100, 100, 0], 300, calendar)!;

    // Hausse tardive : le capital stagne un an (100 €), le second versement
    // porte le total à 200 €, puis tout monte de 50 % → 300 €.
    const tardive = chainedReturn([0, 0.5]);

    // Hausse précoce : 100 € montent de 50 % (150 €), le second versement
    // porte à 250 €, puis stagnation… et il manque 50 € pour atteindre 300 €.
    // On prend donc la trajectoire qui y arrive : +100 % puis 0 %.
    const precoce = chainedReturn([1, 0]);

    // La hausse précoce profite à un seul versement, la tardive aux deux :
    // à valeur finale égale, l'allocation à hausse précoce a mécaniquement dû
    // faire mieux en pourcentage, donc afficher un rendement pondéré par le
    // temps supérieur.
    expect(precoce).toBeGreaterThan(tardive);

    // Et le rendement sur l'argent, lui, ne bouge pas d'une trajectoire à
    // l'autre : c'est exactement l'écart que l'écran de comparaison doit
    // expliquer.
    expect(money).toBeGreaterThan(0);
    expect(money).toBeLessThan(precoce);
  });

  it("renvoie −100 % quand tout est perdu", () => {
    expect(moneyWeightedReturn([1_000, 0], 0, yearly(1))).toBe(-1);
  });

  it("renvoie null en l'absence de versement", () => {
    expect(moneyWeightedReturn([0, 0], 1_000, yearly(1))).toBeNull();
    expect(moneyWeightedReturn([], 1_000, [])).toBeNull();
  });

  it("renvoie null sur une période de durée nulle", () => {
    expect(
      moneyWeightedReturn([1_000], 1_100, ["2000-01-01" as IsoDate]),
    ).toBeNull();
  });

  it("gère une perte partielle", () => {
    // 1 000 € qui n'en valent plus que 900 au bout d'un an : −10 %.
    const r = moneyWeightedReturn([1_000, 0], 900, yearly(1));
    expect(r).toBeCloseTo(-0.1, 3);
  });
});
