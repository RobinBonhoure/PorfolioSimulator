import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { BacktestMetrics, StrategyParams } from "@/lib/engine/types";
import { assets } from "./assets";
import { user } from "./auth";

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Typé sur le contrat du moteur : ce qui est stocké est exactement ce que
     *  `runBacktest` consomme, sans transformation intermédiaire. */
    params: jsonb("params").notNull().$type<StrategyParams>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("strategies_user_idx").on(table.userId)],
);

export const strategyAssets = pgTable(
  "strategy_assets",
  {
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      // `restrict` volontaire : supprimer un actif référencé par une stratégie
      // fausserait silencieusement des backtests déjà enregistrés.
      .references(() => assets.id, { onDelete: "restrict" }),
    /** Poids cible en **fraction** (0.6 = 60 %). L'UI affiche des pourcentages ;
     *  la conversion se fait à la validation zod, jamais plus bas. */
    targetWeight: numeric("target_weight", {
      precision: 9,
      scale: 8,
    }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.strategyId, table.assetId] })],
);

/**
 * Cache des métriques de backtest.
 *
 * Seuls les scalaires sont persistés. Les séries quotidiennes (plusieurs méga-
 * octets par exécution) sont entièrement redérivables de `price_series` et sont
 * donc recalculées à la demande plutôt que stockées.
 *
 * `paramsHash` intègre `ENGINE_VERSION` : faire évoluer la logique de calcul
 * invalide automatiquement les résultats antérieurs.
 */
export const backtestResults = pgTable(
  "backtest_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    paramsHash: text("params_hash").notNull(),
    /** Dernière date de cotation utilisée : une donnée plus fraîche rend le
     *  résultat obsolète même à paramètres identiques. */
    dataThroughDate: date("data_through_date").notNull(),
    metrics: jsonb("metrics").notNull().$type<BacktestMetrics>(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("backtest_results_unique_idx").on(
      table.strategyId,
      table.paramsHash,
      table.dataThroughDate,
    ),
    index("backtest_results_strategy_idx").on(table.strategyId),
  ],
);

export const strategiesRelations = relations(strategies, ({ one, many }) => ({
  user: one(user, { fields: [strategies.userId], references: [user.id] }),
  assets: many(strategyAssets),
  results: many(backtestResults),
}));

export const strategyAssetsRelations = relations(strategyAssets, ({ one }) => ({
  strategy: one(strategies, {
    fields: [strategyAssets.strategyId],
    references: [strategies.id],
  }),
  asset: one(assets, {
    fields: [strategyAssets.assetId],
    references: [assets.id],
  }),
}));

export const backtestResultsRelations = relations(
  backtestResults,
  ({ one }) => ({
    strategy: one(strategies, {
      fields: [backtestResults.strategyId],
      references: [strategies.id],
    }),
  }),
);

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
export type StrategyAsset = typeof strategyAssets.$inferSelect;
export type BacktestResultRow = typeof backtestResults.$inferSelect;
