import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  assets,
  backtestResults,
  strategies,
  strategyAssets,
} from "@/lib/db/schema";
import type { BacktestMetrics } from "@/lib/engine/types";

/**
 * Toutes les requêtes de ce module filtrent explicitement sur `userId`.
 *
 * Le filtre n'est jamais optionnel et n'est jamais déduit d'un paramètre
 * d'URL : l'identifiant vient de la session validée côté serveur. C'est la
 * seule garantie qu'une stratégie ne fuite pas d'un compte à l'autre.
 */

export interface StrategyListItem {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  assetCount: number;
  /** Vrai si tous les actifs sont éligibles au PEA et qu'aucun n'est inconnu. */
  peaEligible: boolean;
  /** Métriques du dernier calcul, `null` si la stratégie n'a jamais été lancée. */
  metrics: BacktestMetrics | null;
}

export async function listStrategiesForUser(
  userId: string,
): Promise<StrategyListItem[]> {
  const rows = await db
    .select({
      id: strategies.id,
      name: strategies.name,
      description: strategies.description,
      updatedAt: strategies.updatedAt,
      assetCount: sql<number>`cast(count(distinct ${strategyAssets.assetId}) as int)`,
      // `bool_and` sur une colonne nullable renvoie null dès qu'une éligibilité
      // est inconnue ; on le ramène à faux, l'incertitude ne valant pas
      // affirmation.
      peaEligible: sql<boolean>`coalesce(bool_and(${assets.peaEligible}), false)`,
    })
    .from(strategies)
    .leftJoin(strategyAssets, eq(strategyAssets.strategyId, strategies.id))
    .leftJoin(assets, eq(assets.id, strategyAssets.assetId))
    .where(eq(strategies.userId, userId))
    .groupBy(strategies.id)
    .orderBy(desc(strategies.updatedAt));

  if (rows.length === 0) return [];

  // Dernier résultat calculé par stratégie. `distinct on` est propre à
  // PostgreSQL et évite la fenêtre analytique qu'exigerait un SQL portable.
  const cached = await db.execute<{
    strategy_id: string;
    metrics: BacktestMetrics;
  }>(sql`
    SELECT DISTINCT ON (${backtestResults.strategyId})
      ${backtestResults.strategyId} AS strategy_id,
      ${backtestResults.metrics}    AS metrics
    FROM ${backtestResults}
    WHERE ${backtestResults.strategyId} IN (
      SELECT ${strategies.id} FROM ${strategies}
      WHERE ${strategies.userId} = ${userId}
    )
    ORDER BY ${backtestResults.strategyId}, ${backtestResults.computedAt} DESC
  `);

  const metricsById = new Map(
    cached.rows.map((row) => [row.strategy_id, row.metrics]),
  );

  return rows.map((row) => ({
    ...row,
    metrics: metricsById.get(row.id) ?? null,
  }));
}

/** Renvoie `null` si la stratégie n'existe pas *ou* appartient à quelqu'un
 *  d'autre — l'appelant transforme les deux cas en 404, sans distinction, pour
 *  ne pas révéler l'existence de la stratégie d'un autre utilisateur. */
export async function getStrategyForUser(strategyId: string, userId: string) {
  const [strategy] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.userId, userId)))
    .limit(1);

  return strategy ?? null;
}

/** Vérifie en une requête que toutes les stratégies demandées appartiennent
 *  bien à l'utilisateur — utilisé par la comparaison. */
export async function getOwnedStrategyIds(
  strategyIds: readonly string[],
  userId: string,
): Promise<string[]> {
  if (strategyIds.length === 0) return [];

  const rows = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(
      and(
        eq(strategies.userId, userId),
        sql`${strategies.id} = ANY(${sql.param(strategyIds)}::uuid[])`,
      ),
    );

  return rows.map((row) => row.id);
}
