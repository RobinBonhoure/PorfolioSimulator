import type { IsoDate } from "@/lib/engine/types";
import { YahooDataError, withYahoo } from "./client";

export interface FetchedPrice {
  date: IsoDate;
  /** Clôture ajustée : dividendes réinvestis et divisions corrigées. */
  closeAdjusted: number;
}

export interface FetchedSeries {
  symbol: string;
  currency: string;
  /** Première date de cotation connue de Yahoo, toutes périodes confondues. */
  firstTradeDate: IsoDate | null;
  prices: FetchedPrice[];
}

/** Date la plus ancienne demandée par défaut : au-delà, Yahoo n'a rien pour personne. */
const EARLIEST_REQUEST = "1970-01-01";

/**
 * Historique quotidien d'un symbole.
 *
 * On utilise systématiquement la **clôture ajustée** : elle réinvestit les
 * dividendes et corrige les divisions d'actions. Prendre la clôture brute
 * sous-estimerait la performance de tout actif distribuant, ce qui fausserait
 * la comparaison entre un ETF capitalisant et un ETF distribuant suivant
 * pourtant le même indice.
 */
export async function fetchDailyPrices(
  symbol: string,
  from: IsoDate = EARLIEST_REQUEST,
): Promise<FetchedSeries> {
  return withYahoo(symbol, async (yf) => {
    const chart = await yf.chart(symbol, {
      period1: from,
      interval: "1d",
    });

    const prices: FetchedPrice[] = [];
    for (const quote of chart.quotes ?? []) {
      // Yahoo renvoie des points partiels (séances écourtées, données en cours
      // de consolidation) où la clôture est nulle : les conserver injecterait
      // des prix à zéro dans le moteur.
      const value = quote.adjclose ?? quote.close;
      if (value === null || value === undefined || !Number.isFinite(value)) {
        continue;
      }
      if (value <= 0) continue;

      const date =
        quote.date instanceof Date
          ? quote.date.toISOString().slice(0, 10)
          : String(quote.date).slice(0, 10);

      prices.push({ date, closeAdjusted: value });
    }

    if (prices.length === 0) {
      throw new YahooDataError(
        "no-data",
        symbol,
        `Aucune cotation exploitable pour ${symbol}.`,
      );
    }

    const meta = chart.meta;
    return {
      symbol,
      currency: meta.currency ?? "EUR",
      firstTradeDate: meta.firstTradeDate
        ? new Date(meta.firstTradeDate).toISOString().slice(0, 10)
        : null,
      prices,
    };
  });
}
