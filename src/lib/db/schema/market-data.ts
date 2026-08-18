import {
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { assets } from "./assets";

/**
 * Cache des cours quotidiens ajustés (dividendes réinvestis).
 *
 * `closeNative` est la donnée de référence : c'est elle, convertie à la volée
 * par le moteur avec `fxSeries`, qui alimente tous les calculs. `closeEur` est
 * une commodité d'affichage (sparklines, aperçus) pré-calculée à l'écriture pour
 * éviter une jointure ; **aucun calcul de backtest ne doit s'appuyer dessus**,
 * sans quoi la logique de change échapperait aux tests unitaires.
 */
export const priceSeries = pgTable(
  "price_series",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    closeNative: numeric("close_native", { precision: 18, scale: 6 }).notNull(),
    closeEur: numeric("close_eur", { precision: 18, scale: 6 }),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.date] }),
    index("price_series_asset_date_idx").on(table.assetId, table.date),
  ],
);

/** Taux de change historiques. `rateToEur` = nombre d'euros pour 1 unité de la devise. */
export const fxSeries = pgTable(
  "fx_series",
  {
    currency: text("currency").notNull(),
    date: date("date").notNull(),
    rateToEur: numeric("rate_to_eur", { precision: 18, scale: 8 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.currency, table.date] })],
);

export const inflationRegionEnum = pgEnum("inflation_region", ["FR", "EA"]);

/** Indice des prix à la consommation harmonisé, mensuel. */
export const inflationSeries = pgTable(
  "inflation_series",
  {
    region: inflationRegionEnum("region").notNull(),
    /** Premier jour du mois de l'observation. */
    period: date("period").notNull(),
    hicpIndex: numeric("hicp_index", { precision: 12, scale: 4 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.region, table.period] })],
);

/**
 * Journal de fraîcheur du cache, par série.
 *
 * Sans cette table il faudrait un `max(date)` sur `price_series` à chaque
 * vérification, et surtout on ne saurait pas distinguer « jamais récupéré » de
 * « récupéré, mais la source n'a rien de plus récent » — distinction nécessaire
 * pour ne pas re-solliciter Yahoo à chaque backtest sur un actif délisté.
 */
export const dataFetchLog = pgTable(
  "data_fetch_log",
  {
    /** `asset:<uuid>` ou `fx:<devise>`. */
    seriesKey: text("series_key").primaryKey(),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Dernière date de cotation effectivement obtenue. */
    lastDataDate: date("last_data_date"),
    /** Dernière erreur rencontrée, pour l'afficher sans relancer un appel. */
    lastError: text("last_error"),
  },
);

export type PriceRow = typeof priceSeries.$inferSelect;
export type FxRow = typeof fxSeries.$inferSelect;
export type InflationRow = typeof inflationSeries.$inferSelect;
