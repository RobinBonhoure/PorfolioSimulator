import YahooFinance from "yahoo-finance2";

/** Le paquet exporte un constructeur, pas un type : on dérive le type d'instance. */
type YahooClient = InstanceType<typeof YahooFinance>;

/**
 * Accès à Yahoo Finance.
 *
 * L'API n'est ni officielle ni contractuelle : elle peut limiter le débit,
 * changer de schéma ou faire disparaître un actif délisté avec tout son
 * historique. Chaque appel passe donc par ce module, qui traduit les échecs en
 * erreurs typées porteuses d'un message affichable, plutôt que de laisser
 * remonter une exception brute jusqu'à l'interface.
 */

export type YahooFailureKind =
  | "not-found"
  | "no-data"
  | "rate-limited"
  | "network"
  | "unknown";

export class YahooDataError extends Error {
  constructor(
    readonly kind: YahooFailureKind,
    readonly symbol: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "YahooDataError";
  }
}

let client: YahooClient | null = null;

function getClient(): YahooClient {
  if (!client) {
    client = new YahooFinance({
      suppressNotices: ["yahooSurvey"],
      // Les écarts de schéma sont fréquents sur une API non documentée et ne
      // doivent pas polluer les journaux de production ; ce qui compte est que
      // les cours soient exploitables, ce que la couche appelante vérifie.
      validation: { logErrors: false },
    });
  }
  return client;
}

function classify(error: unknown, symbol: string): YahooDataError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("not found") || lower.includes("no such")) {
    return new YahooDataError(
      "not-found",
      symbol,
      `Le symbole ${symbol} est introuvable chez Yahoo Finance. Vérifiez son orthographe ou sa place de cotation.`,
      error,
    );
  }

  if (lower.includes("data doesn't exist") || lower.includes("no data")) {
    return new YahooDataError(
      "no-data",
      symbol,
      `Aucune cotation disponible pour ${symbol} sur la période demandée. L'actif est peut-être trop récent ou délisté.`,
      error,
    );
  }

  if (
    lower.includes("too many requests") ||
    lower.includes("429") ||
    lower.includes("rate limit")
  ) {
    return new YahooDataError(
      "rate-limited",
      symbol,
      "Yahoo Finance limite temporairement les requêtes. Réessayez dans une minute.",
      error,
    );
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout")
  ) {
    return new YahooDataError(
      "network",
      symbol,
      `La connexion à Yahoo Finance a échoué pour ${symbol}.`,
      error,
    );
  }

  return new YahooDataError(
    "unknown",
    symbol,
    `Récupération impossible pour ${symbol} : ${message}`,
    error,
  );
}

/**
 * Exécute un appel Yahoo avec quelques tentatives espacées.
 *
 * Seules les erreurs transitoires — limitation de débit et incidents réseau —
 * sont réessayées. Retenter sur un symbole introuvable ne ferait que retarder
 * un message d'erreur inévitable.
 */
export async function withYahoo<T>(
  symbol: string,
  operation: (yf: YahooClient) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: YahooDataError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(getClient());
    } catch (error) {
      lastError = classify(error, symbol);

      const retryable =
        lastError.kind === "rate-limited" || lastError.kind === "network";
      if (!retryable || attempt === attempts - 1) throw lastError;

      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** attempt),
      );
    }
  }

  throw lastError ?? classify(new Error("échec inattendu"), symbol);
}
