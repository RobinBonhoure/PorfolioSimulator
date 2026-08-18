import type { IsoDate } from "@/lib/engine/types";
import { fetchDailyPrices } from "./prices";

export interface FetchedFxPoint {
  date: IsoDate;
  /** Nombre d'euros pour une unité de la devise. */
  rateToEur: number;
}

/**
 * Symbole Yahoo d'une paire contre euro.
 *
 * Attention au sens de lecture : `EURUSD=X` cote le nombre de **dollars pour un
 * euro** (environ 1,09), alors que le moteur a besoin du nombre d'**euros pour
 * un dollar**. La conversion prend donc l'inverse — se tromper de sens produit
 * une performance plausible mais fausse d'environ 20 %, le genre d'erreur qui
 * passe inaperçu longtemps.
 */
export function fxSymbolFor(currency: string): string {
  return `EUR${currency.toUpperCase()}=X`;
}

export async function fetchFxSeries(
  currency: string,
  from?: IsoDate,
): Promise<FetchedFxPoint[]> {
  if (currency.toUpperCase() === "EUR") return [];

  const series = await fetchDailyPrices(fxSymbolFor(currency), from);

  return series.prices
    .filter((point) => point.closeAdjusted > 0)
    .map((point) => ({
      date: point.date,
      rateToEur: 1 / point.closeAdjusted,
    }));
}
