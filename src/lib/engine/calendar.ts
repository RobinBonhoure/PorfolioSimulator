import type { IsoDate, PricePoint } from "./types";

/**
 * Construction du calendrier de simulation et remplissage des trous de cotation.
 *
 * Les dates sont manipulées comme des chaînes ISO `YYYY-MM-DD` : elles se
 * comparent et se trient lexicographiquement, ce qui évite toute ambiguïté de
 * fuseau horaire — un piège classique quand une place cote à Paris et l'autre à
 * New York.
 */

/** Jour de la semaine, 0 = dimanche. Calculé en UTC, sans dépendance au fuseau. */
export function dayOfWeek(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms =
    new Date(`${to}T00:00:00Z`).getTime() -
    new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** `YYYY-MM` — clé de regroupement mensuel. */
export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

/** `YYYY` — clé de regroupement annuel. */
export function yearKey(date: IsoDate): string {
  return date.slice(0, 4);
}

/**
 * Calendrier de simulation : jours de semaine où au moins un actif a coté.
 *
 * Les week-ends sont écartés même quand un actif y cote (c'est le cas des
 * crypto-actifs). Les conserver ferait passer l'année de ~252 à ~365
 * observations et fausserait toutes les annualisations en √252, en gonflant
 * artificiellement la volatilité affichée d'un portefeuille contenant du
 * bitcoin par rapport à un portefeuille d'ETF. Les jours fériés propres à une
 * place restent dans le calendrier si une autre place cote : le cours manquant
 * est alors reporté depuis la veille.
 */
export function buildCalendar(
  seriesList: readonly PricePoint[][],
  startDate: IsoDate,
  endDate: IsoDate,
): IsoDate[] {
  const dates = new Set<IsoDate>();

  for (const series of seriesList) {
    for (const point of series) {
      if (point.date < startDate || point.date > endDate) continue;
      if (isWeekend(point.date)) continue;
      dates.add(point.date);
    }
  }

  return [...dates].sort();
}

/**
 * Projette une série de prix sur un calendrier en reportant la dernière valeur
 * connue (forward-fill).
 *
 * Renvoie `null` pour les dates antérieures à la première cotation : c'est au
 * moteur de décider quoi en faire (démarrage retardé ou proxy), pas au
 * remplissage de fabriquer une valeur.
 */
export function forwardFill(
  series: readonly PricePoint[],
  calendar: readonly IsoDate[],
): (number | null)[] {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const filled: (number | null)[] = new Array(calendar.length).fill(null);

  let cursor = 0;
  let last: number | null = null;

  for (let i = 0; i < calendar.length; i += 1) {
    const date = calendar[i];
    while (cursor < sorted.length && sorted[cursor].date <= date) {
      last = sorted[cursor].close;
      cursor += 1;
    }
    filled[i] = last;
  }

  return filled;
}

/**
 * Indices des premiers jours ouvrés de chaque mois présents dans le calendrier.
 *
 * Sert au versement mensuel et au rééquilibrage de calendrier. Le premier jour
 * du calendrier n'est jamais retenu : l'investissement initial y a déjà eu lieu,
 * un versement le même jour ferait double emploi.
 */
export function firstBusinessDayIndices(calendar: readonly IsoDate[]): number[] {
  const indices: number[] = [];
  let currentMonth = "";

  for (let i = 0; i < calendar.length; i += 1) {
    const month = monthKey(calendar[i]);
    if (month !== currentMonth) {
      currentMonth = month;
      if (i > 0) indices.push(i);
    }
  }

  return indices;
}

/** Nombre de mois entiers entre deux dates, utilisé pour la périodicité. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  return (ty - fy) * 12 + (tm - fm);
}
