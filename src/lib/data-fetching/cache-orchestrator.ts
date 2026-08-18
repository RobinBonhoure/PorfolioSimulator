import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dataFetchLog, fxSeries, priceSeries } from "@/lib/db/schema";
import type { FxPoint, IsoDate, PricePoint } from "@/lib/engine/types";
import { YahooDataError } from "./yahoo/client";
import { fetchFxSeries } from "./yahoo/fx";
import { fetchDailyPrices } from "./yahoo/prices";

/**
 * Cache des données de marché.
 *
 * Politique : première demande d'un actif → historique complet récupéré et
 * stocké ; demandes suivantes → lecture en base, et appel à Yahoo uniquement
 * pour le delta si la dernière récupération date de plus de vingt-quatre
 * heures. Un backtest ne doit pas dépendre du réseau une fois les données
 * présentes.
 *
 * Le cache stocke la donnée **brute**. Combler les trous de cotation et aligner
 * les calendriers relève du moteur, qui doit rester seul maître de ces choix —
 * les faire ici les rendrait invisibles et intestables.
 */

/** Au-delà, on interroge Yahoo pour la suite de la série. */
const FRESHNESS_HOURS = 24;

/** Neon accepte de gros lots, mais un insert de plusieurs milliers de lignes en
 *  une requête finit par dépasser les limites du driver HTTP. */
const INSERT_BATCH_SIZE = 1_000;

const assetKey = (assetId: string) => `asset:${assetId}`;
const fxKey = (currency: string) => `fx:${currency.toUpperCase()}`;

interface FreshnessRow {
  lastFetchedAt: Date;
  lastDataDate: string | null;
}

async function readFreshness(key: string): Promise<FreshnessRow | null> {
  const [row] = await db
    .select({
      lastFetchedAt: dataFetchLog.lastFetchedAt,
      lastDataDate: dataFetchLog.lastDataDate,
    })
    .from(dataFetchLog)
    .where(eq(dataFetchLog.seriesKey, key))
    .limit(1);

  return row ?? null;
}

async function writeFreshness(
  key: string,
  lastDataDate: IsoDate | null,
  lastError: string | null,
): Promise<void> {
  await db
    .insert(dataFetchLog)
    .values({
      seriesKey: key,
      lastFetchedAt: new Date(),
      lastDataDate,
      lastError,
    })
    .onConflictDoUpdate({
      target: dataFetchLog.seriesKey,
      set: { lastFetchedAt: new Date(), lastDataDate, lastError },
    });
}

function isStale(row: FreshnessRow | null): boolean {
  if (!row) return true;
  const ageHours = (Date.now() - row.lastFetchedAt.getTime()) / 3_600_000;
  return ageHours >= FRESHNESS_HOURS;
}

async function insertInBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    await insert(rows.slice(i, i + INSERT_BATCH_SIZE));
  }
}

// ---------------------------------------------------------------------------
// Cours
// ---------------------------------------------------------------------------

export interface HydrationOutcome {
  fetched: number;
  fromCache: boolean;
  /** Renseigné quand la récupération a échoué mais que le cache reste utilisable. */
  warning?: string;
}

/**
 * Garantit que le cache contient l'historique d'un actif.
 *
 * Une erreur Yahoo alors que des données sont déjà en cache n'interrompt pas le
 * backtest : mieux vaut un résultat calculé sur des cours vieux d'un jour qu'un
 * écran d'erreur. L'incident est signalé et remonté à l'interface.
 */
export async function ensureAssetPrices(
  assetId: string,
  ticker: string,
): Promise<HydrationOutcome> {
  const key = assetKey(assetId);
  const freshness = await readFreshness(key);

  if (!isStale(freshness)) {
    return { fetched: 0, fromCache: true };
  }

  const from = freshness?.lastDataDate ?? undefined;

  try {
    const series = await fetchDailyPrices(ticker, from);

    const rows = series.prices
      // Sur une mise à jour incrémentale, Yahoo renvoie aussi la dernière
      // séance déjà connue : l'upsert la neutralise, mais l'écarter tout de
      // suite évite un aller-retour inutile.
      .filter((p) => !from || p.date >= from)
      .map((p) => ({
        assetId,
        date: p.date,
        closeNative: p.closeAdjusted.toFixed(6),
      }));

    await insertInBatches(rows, (batch) =>
      db
        .insert(priceSeries)
        .values(batch)
        .onConflictDoUpdate({
          target: [priceSeries.assetId, priceSeries.date],
          set: { closeNative: sql`excluded.close_native` },
        }),
    );

    const lastDate = rows.at(-1)?.date ?? freshness?.lastDataDate ?? null;
    await writeFreshness(key, lastDate, null);

    return { fetched: rows.length, fromCache: false };
  } catch (error) {
    const message =
      error instanceof YahooDataError
        ? error.message
        : `Récupération impossible pour ${ticker}.`;

    await writeFreshness(key, freshness?.lastDataDate ?? null, message);

    // Aucune donnée en cache : il n'y a rien à sauver, l'erreur doit remonter.
    if (!freshness?.lastDataDate) throw error;

    return { fetched: 0, fromCache: true, warning: message };
  }
}

export async function loadPriceSeries(
  assetId: string,
  from?: IsoDate,
): Promise<PricePoint[]> {
  const rows = await db
    .select({ date: priceSeries.date, close: priceSeries.closeNative })
    .from(priceSeries)
    .where(
      from
        ? and(eq(priceSeries.assetId, assetId), gt(priceSeries.date, from))
        : eq(priceSeries.assetId, assetId),
    )
    .orderBy(asc(priceSeries.date));

  return rows.map((row) => ({ date: row.date, close: Number(row.close) }));
}

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

export async function ensureFxSeries(
  currency: string,
): Promise<HydrationOutcome> {
  const upper = currency.toUpperCase();
  if (upper === "EUR") return { fetched: 0, fromCache: true };

  const key = fxKey(upper);
  const freshness = await readFreshness(key);

  if (!isStale(freshness)) {
    return { fetched: 0, fromCache: true };
  }

  const from = freshness?.lastDataDate ?? undefined;

  try {
    const points = await fetchFxSeries(upper, from);

    const rows = points
      .filter((p) => !from || p.date >= from)
      .map((p) => ({
        currency: upper,
        date: p.date,
        rateToEur: p.rateToEur.toFixed(8),
      }));

    await insertInBatches(rows, (batch) =>
      db
        .insert(fxSeries)
        .values(batch)
        .onConflictDoUpdate({
          target: [fxSeries.currency, fxSeries.date],
          set: { rateToEur: sql`excluded.rate_to_eur` },
        }),
    );

    const lastDate = rows.at(-1)?.date ?? freshness?.lastDataDate ?? null;
    await writeFreshness(key, lastDate, null);

    return { fetched: rows.length, fromCache: false };
  } catch (error) {
    const message =
      error instanceof YahooDataError
        ? error.message
        : `Récupération impossible du change ${upper}.`;

    await writeFreshness(key, freshness?.lastDataDate ?? null, message);
    if (!freshness?.lastDataDate) throw error;

    return { fetched: 0, fromCache: true, warning: message };
  }
}

export async function loadFxSeries(currency: string): Promise<FxPoint[]> {
  const upper = currency.toUpperCase();
  if (upper === "EUR") return [];

  const rows = await db
    .select({ date: fxSeries.date, rate: fxSeries.rateToEur })
    .from(fxSeries)
    .where(eq(fxSeries.currency, upper))
    .orderBy(asc(fxSeries.date));

  return rows.map((row) => ({ date: row.date, rateToEur: Number(row.rate) }));
}

/** Dernière date de cotation connue, toutes séries confondues : entre dans la
 *  clé de cache des résultats de backtest. */
export async function latestDataDate(
  assetIds: readonly string[],
): Promise<IsoDate | null> {
  if (assetIds.length === 0) return null;

  const [row] = await db
    .select({ maxDate: sql<string | null>`max(${priceSeries.date})` })
    .from(priceSeries)
    .where(inArray(priceSeries.assetId, [...assetIds]));

  return row?.maxDate ?? null;
}
