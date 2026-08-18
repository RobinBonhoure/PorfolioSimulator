import { monthKey } from "./calendar";
import type { InflationPoint, IsoDate } from "./types";

/**
 * Passage en euros constants.
 *
 * L'indice des prix est mensuel alors que la simulation est quotidienne : on
 * applique l'indice du mois en cours à tous ses jours, sans interpoler. Une
 * interpolation donnerait une courbe plus lisse mais suggérerait une précision
 * que la donnée source n'a pas.
 */

/**
 * Facteurs de déflation, base 1 au premier jour de la période.
 *
 * Un facteur de 0,8 en fin de période signifie qu'un euro d'alors vaut 80
 * centimes du premier jour. Multiplier une valeur nominale par ce facteur donne
 * son pouvoir d'achat exprimé en euros du début.
 */
export function buildDeflators(
  calendar: readonly IsoDate[],
  inflation: readonly InflationPoint[],
): number[] {
  if (calendar.length === 0) return [];
  if (inflation.length === 0) return new Array(calendar.length).fill(1);

  const indexByMonth = new Map<string, number>();
  for (const point of inflation) {
    indexByMonth.set(monthKey(point.period), point.hicpIndex);
  }

  const sorted = [...inflation].sort((a, b) => a.period.localeCompare(b.period));

  /** Indice du mois demandé, ou le plus proche disponible en amont. */
  const indexFor = (date: IsoDate): number => {
    const exact = indexByMonth.get(monthKey(date));
    if (exact !== undefined) return exact;

    let fallback = sorted[0].hicpIndex;
    for (const point of sorted) {
      if (point.period.slice(0, 7) > monthKey(date)) break;
      fallback = point.hicpIndex;
    }
    return fallback;
  };

  const base = indexFor(calendar[0]);
  if (!base) return new Array(calendar.length).fill(1);

  return calendar.map((date) => base / indexFor(date));
}
