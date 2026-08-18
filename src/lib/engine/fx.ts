import { forwardFill } from "./calendar";
import type { FxPoint, IsoDate, PricePoint } from "./types";

/**
 * Conversion des cours en euros.
 *
 * Le change est appliqué **jour par jour** avec le taux historique : convertir
 * au taux final fausserait toute la trajectoire d'un actif en dollars, et pas
 * seulement sa valeur de fin.
 */

export class MissingFxDataError extends Error {
  constructor(
    readonly currency: string,
    readonly date: IsoDate,
  ) {
    super(
      `Aucun taux de change ${currency}→EUR disponible au ${date}. ` +
        `Réduisez la durée du backtest ou retirez les actifs libellés en ${currency}.`,
    );
    this.name = "MissingFxDataError";
  }
}

/**
 * Taux de change projetés sur le calendrier, reportés depuis la veille les jours
 * sans cotation.
 *
 * Une devise inconnue de `fx` est traitée comme l'euro (taux 1). Ce n'est pas un
 * repli silencieux : la couche de données garantit qu'une série existe pour
 * chaque devise non-euro utilisée, et l'absence de série est rattrapée par
 * `firstFxDate` au moment de fixer la date de départ.
 */
export function buildFxLookup(
  currency: string,
  fx: Record<string, readonly FxPoint[]>,
  calendar: readonly IsoDate[],
): number[] {
  if (currency === "EUR") return new Array(calendar.length).fill(1);

  const series = fx[currency];
  if (!series || series.length === 0) {
    throw new MissingFxDataError(currency, calendar[0] ?? "?");
  }

  const asPrices: PricePoint[] = series.map((p) => ({
    date: p.date,
    close: p.rateToEur,
  }));
  const filled = forwardFill(asPrices, calendar);

  return filled.map((rate, i) => {
    if (rate === null) throw new MissingFxDataError(currency, calendar[i]);
    return rate;
  });
}

/**
 * Première date à laquelle une devise dispose d'un taux.
 *
 * Contrainte réelle et facile à sous-estimer : la série EUR/USD de Yahoo ne
 * remonte qu'à décembre 2003. Tout backtest contenant un actif en dollars est
 * donc plafonné à cette antériorité, quelle que soit l'ancienneté de l'actif
 * lui-même — un backtest Apple sur trente ans n'est pas possible en euros.
 */
export function firstFxDate(
  currency: string,
  fx: Record<string, readonly FxPoint[]>,
): IsoDate | null {
  if (currency === "EUR") return null;

  const series = fx[currency];
  if (!series || series.length === 0) return null;

  return series.reduce(
    (min, point) => (point.date < min ? point.date : min),
    series[0].date,
  );
}
