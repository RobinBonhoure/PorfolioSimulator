import { withYahoo } from "./client";

export interface YahooSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  /** Type Yahoo brut : EQUITY, ETF, CRYPTOCURRENCY, INDEX… */
  quoteType: string;
}

/** Types Yahoo qu'il est raisonnable d'ajouter à une stratégie. */
const SUPPORTED_QUOTE_TYPES = new Set([
  "EQUITY",
  "ETF",
  "MUTUALFUND",
  "CRYPTOCURRENCY",
  "FUTURE",
]);

/**
 * Recherche hors catalogue.
 *
 * Utilisée uniquement quand le catalogue curaté ne renvoie rien. Les actifs
 * ainsi trouvés arrivent sans éligibilité PEA, sans TER et sans répartition
 * sectorielle : l'interface doit le dire explicitement plutôt que d'afficher
 * des cases vides que l'utilisateur interpréterait comme des zéros.
 */
export async function searchYahoo(
  query: string,
  limit = 8,
): Promise<YahooSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  return withYahoo(trimmed, async (yf) => {
    const response = await yf.search(trimmed, { quotesCount: limit * 2 });

    const results: YahooSearchResult[] = [];
    for (const quote of response.quotes ?? []) {
      if (!("symbol" in quote) || !quote.symbol) continue;

      const quoteType = "quoteType" in quote ? String(quote.quoteType) : "";
      if (!SUPPORTED_QUOTE_TYPES.has(quoteType)) continue;

      // Le type de retour est une union large où chaque champ est optionnel :
      // on normalise en chaîne plutôt que de restreindre le type à un seul
      // variant, qui casserait au prochain type de résultat ajouté par Yahoo.
      const symbol = String(quote.symbol);
      const longName = "longname" in quote ? quote.longname : undefined;
      const shortName = "shortname" in quote ? quote.shortname : undefined;
      const name = longName || shortName || symbol;

      results.push({
        symbol,
        name: String(name),
        exchange: "exchange" in quote ? String(quote.exchange ?? "") : "",
        quoteType,
      });

      if (results.length >= limit) break;
    }

    return results;
  });
}
