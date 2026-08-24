import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { StrategyParams } from "@/lib/engine/types";
import { user } from "./auth";

/**
 * Dernière comparaison consultée, une ligne par utilisateur.
 *
 * L'URL reste la source de vérité d'une comparaison donnée — c'est ce qui la
 * rend partageable par simple copie du lien. Cette table ne sert qu'à retrouver
 * la dernière en date en arrivant sur l'écran les mains vides, plutôt que de
 * repartir d'une sélection nulle à chaque visite.
 *
 * Les identifiants ne portent **aucune clé étrangère**, délibérément : une
 * stratégie supprimée ne doit pas faire échouer une écriture ni disparaître
 * silencieusement d'un `ON DELETE CASCADE` partiel. La lecture filtre ce qui
 * n'existe plus, ce qui est de toute façon nécessaire pour les stratégies dont
 * la propriété a pu changer.
 */
export const lastComparisons = pgTable("last_comparisons", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  strategyIds: uuid("strategy_ids")
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  assetIds: uuid("asset_ids")
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  /** Plan d'investissement appliqué à tous les éléments comparés. `null` pour
   *  les lignes écrites avant que la comparaison ne devienne paramétrable. */
  params: jsonb("params").$type<StrategyParams>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LastComparison = typeof lastComparisons.$inferSelect;
