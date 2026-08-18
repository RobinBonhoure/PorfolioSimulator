import type { IsoDate } from "../types";

/**
 * Taux sans risque de la zone euro, par paliers annuels.
 *
 * **Ce sont des approximations assumées, pas la série officielle.** Le Sharpe et
 * le Sortino ont besoin d'un taux sans risque ; récupérer la série quotidienne
 * €STR auprès de la BCE ajouterait une dépendance réseau et un cache
 * supplémentaires pour une donnée qui, moyennée à l'année, ne déplace le Sharpe
 * que de quelques centièmes sur un backtest long.
 *
 * Source et méthode : moyenne annuelle de l'€STR depuis 2020 (la série ne
 * commence qu'en octobre 2019), et de l'EONIA — son prédécesseur, dont l'écart
 * avec l'€STR était de 8,5 points de base — pour les années antérieures. Les
 * valeurs sont arrondies au centième de point.
 *
 * À revoir chaque année : ajouter le palier de l'année écoulée. Sans mise à
 * jour, `FALLBACK_RATE` prend le relais et le Sharpe des périodes récentes
 * dérive silencieusement.
 *
 * Dernière mise à jour : août 2026.
 */
const ANNUAL_RATES: Record<number, number> = {
  2000: 0.0412,
  2001: 0.0439,
  2002: 0.0329,
  2003: 0.0232,
  2004: 0.0205,
  2005: 0.0209,
  2006: 0.0283,
  2007: 0.0387,
  2008: 0.0387,
  2009: 0.0071,
  2010: 0.0044,
  2011: 0.0087,
  2012: 0.0023,
  2013: 0.0009,
  2014: 0.0009,
  2015: -0.0011,
  2016: -0.0032,
  2017: -0.0035,
  2018: -0.0036,
  2019: -0.004,
  2020: -0.0047,
  2021: -0.0057,
  2022: -0.0002,
  2023: 0.0321,
  2024: 0.0365,
  2025: 0.022,
  2026: 0.02,
};

/** Utilisé hors de la plage couverte : moyenne longue période, volontairement neutre. */
const FALLBACK_RATE = 0.02;

/** Taux sans risque annualisé applicable à une date. */
export function getRiskFreeRate(date: IsoDate): number {
  const year = Number(date.slice(0, 4));
  return ANNUAL_RATES[year] ?? FALLBACK_RATE;
}

/**
 * Taux sans risque moyen sur une période, pondéré par le nombre de jours de
 * bourse de chaque année : c'est ce taux moyen qui entre au dénominateur du
 * Sharpe, et non celui de la dernière année.
 */
export function getAverageRiskFreeRate(calendar: readonly IsoDate[]): number {
  if (calendar.length === 0) return FALLBACK_RATE;

  let sum = 0;
  for (const date of calendar) sum += getRiskFreeRate(date);
  return sum / calendar.length;
}
