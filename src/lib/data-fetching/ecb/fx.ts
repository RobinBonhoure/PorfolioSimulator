import type { IsoDate } from "@/lib/engine/types";
import { YahooDataError } from "../yahoo/client";

/**
 * Taux de change de référence de la Banque centrale européenne.
 *
 * Remplace Yahoo comme source du change, pour deux raisons dont la première
 * est décisive :
 *
 * 1. **La profondeur.** `EURUSD=X` chez Yahoo ne remonte qu'au 1er décembre
 *    2003. Or le moteur borne la période d'un backtest par la disponibilité du
 *    change de chaque devise détenue — un support en dollars ne peut donc pas
 *    être valorisé avant cette date, quelle que soit l'ancienneté de sa propre
 *    cotation. La BCE publie la série quotidienne depuis le 4 janvier 1999,
 *    ce qui fait entrer l'éclatement de la bulle internet dans le champ des
 *    backtests.
 * 2. **La nature de la donnée.** Ce sont les taux de référence officiels,
 *    fixés une fois par jour vers 16 h 00 CET sur la base d'une procédure de
 *    concertation entre banques centrales. Un backtest quotidien a besoin d'un
 *    point par jour, pas d'un cours de marché continu : le fixing est
 *    exactement la bonne granularité, et il ne bouge jamais rétroactivement.
 *
 * **1999 est un plancher et non une limite technique.** L'euro n'existait pas
 * avant, et la BCE ne publie aucune série ECU rétropolée. Descendre plus bas
 * supposerait de reconstituer un euro synthétique à partir du mark et du franc,
 * c'est-à-dire de fabriquer la donnée — ce que ce projet ne fait nulle part.
 */

const ENDPOINT = "https://data-api.ecb.europa.eu/service/data/EXR";

/** En deçà, on considère que la réponse n'a pas la forme attendue : c'est le
 *  garde-fou contre un changement de format côté BCE, qui autrement écraserait
 *  silencieusement un cache correct par une poignée de lignes. */
const MIN_EXPECTED_ROWS = 200;

export interface FetchedFxPoint {
  date: IsoDate;
  /** Nombre d'euros pour une unité de la devise. */
  rateToEur: number;
}

/**
 * Série quotidienne d'une devise contre euro.
 *
 * Attention au sens, c'est le même piège que chez Yahoo : la BCE cote le
 * nombre d'**unités de devise pour un euro** (`USD/EUR` ≈ 1,16 dollar pour un
 * euro), alors que le moteur a besoin du nombre d'**euros pour une unité de
 * devise**. D'où l'inversion ci-dessous. Se tromper de sens produit une
 * performance parfaitement plausible et fausse d'environ 20 %.
 */
export async function fetchFxSeries(
  currency: string,
  from?: IsoDate,
): Promise<FetchedFxPoint[]> {
  const upper = currency.toUpperCase();
  if (upper === "EUR") return [];

  const url = new URL(`${ENDPOINT}/D.${upper}.EUR.SP00.A`);
  url.searchParams.set("format", "csvdata");
  url.searchParams.set("detail", "dataonly");
  if (from) url.searchParams.set("startPeriod", from);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (cause) {
    throw new YahooDataError(
      "network",
      upper,
      `Taux de change ${upper} indisponible : la BCE n'a pas répondu.`,
      cause,
    );
  }

  if (response.status === 404) {
    throw new YahooDataError(
      "not-found",
      upper,
      `La BCE ne publie pas de taux de référence pour ${upper}.`,
    );
  }

  if (!response.ok) {
    throw new YahooDataError(
      response.status === 429 ? "rate-limited" : "unknown",
      upper,
      `Taux de change ${upper} indisponible (HTTP ${response.status}).`,
    );
  }

  const points = parseCsv(await response.text(), upper);

  // Une requête incrémentale peut légitimement ne rien renvoyer — un week-end,
  // un jour férié TARGET. C'est seulement sur un premier chargement, sans
  // `from`, qu'une réponse maigre trahit un problème de format.
  if (!from && points.length < MIN_EXPECTED_ROWS) {
    throw new YahooDataError(
      "no-data",
      upper,
      `Série de change ${upper} anormalement courte (${points.length} points) : ` +
        `le format de la BCE a probablement changé.`,
    );
  }

  return points;
}

function parseCsv(body: string, currency: string): FetchedFxPoint[] {
  // Fins de ligne Windows et marque d'ordre d'octets : la BCE sert les deux, et
  // sans ce nettoyage le dernier en-tête vaut « OBS_VALUE\r », introuvable.
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((cell) => cell.trim());
  const dateAt = header.indexOf("TIME_PERIOD");
  const valueAt = header.indexOf("OBS_VALUE");

  if (dateAt === -1 || valueAt === -1) {
    throw new YahooDataError(
      "unknown",
      currency,
      `Réponse de la BCE illisible pour ${currency} : colonnes attendues absentes.`,
    );
  }

  const points: FetchedFxPoint[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",");
    const date = cells[dateAt]?.trim();
    const raw = Number(cells[valueAt]);

    // Les jours fériés TARGET figurent dans la série sans valeur : les ignorer
    // vaut mieux que de reporter la veille ici. Le moteur comble les trous du
    // calendrier lui-même, et doit rester seul à le faire.
    if (!date || !Number.isFinite(raw) || raw <= 0) continue;

    points.push({ date: date as IsoDate, rateToEur: 1 / raw });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}
