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

/** Une ligne d'une stratégie, telle qu'affichée dans les listes. */
export interface StrategyHolding {
  assetId: string;
  shortLabel: string;
  ticker: string;
  /** Poids cible en fraction. */
  weight: number;
}

export interface StrategyListItem {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  assetCount: number;
  /** Composition complète, du poids le plus lourd au plus léger. Une liste
   *  affiche « 2 actifs » en un coup d'œil, mais c'est la composition qu'on
   *  cherche vraiment quand on hésite entre deux stratégies. */
  holdings: StrategyHolding[];
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

  // Composition de chaque stratégie, en une requête pour toutes plutôt qu'une
  // par ligne : la liste en affiche jusqu'à quelques dizaines.
  const holdingRows = await db
    .select({
      strategyId: strategyAssets.strategyId,
      assetId: assets.id,
      shortLabel: assets.shortLabel,
      ticker: assets.tickerYahoo,
      weight: strategyAssets.targetWeight,
      sortOrder: strategyAssets.sortOrder,
    })
    .from(strategyAssets)
    .innerJoin(assets, eq(assets.id, strategyAssets.assetId))
    .innerJoin(strategies, eq(strategies.id, strategyAssets.strategyId))
    .where(eq(strategies.userId, userId));

  const holdingsById = new Map<string, StrategyHolding[]>();
  for (const row of holdingRows) {
    const list = holdingsById.get(row.strategyId) ?? [];
    list.push({
      assetId: row.assetId,
      shortLabel: row.shortLabel,
      ticker: row.ticker,
      weight: Number(row.weight),
    });
    holdingsById.set(row.strategyId, list);
  }
  // Du plus lourd au plus léger : c'est l'ordre qui renseigne, alors que
  // l'ordre de saisie ne dit rien à qui relit la liste.
  for (const list of holdingsById.values()) {
    list.sort((a, b) => b.weight - a.weight);
  }

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
    holdings: holdingsById.get(row.id) ?? [],
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
