import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import type { StrategyParams } from "@/lib/engine/types";
import { assets, lastComparisons, strategies } from "@/lib/db/schema";

export interface ComparisonSelection {
  strategyIds: string[];
  assetIds: string[];
  /** `null` pour une ligne enregistrée avant que la comparaison ne devienne
   *  paramétrable : l'appelant retombe alors sur les valeurs par défaut. */
  params: StrategyParams | null;
}

export const EMPTY_COMPARISON: ComparisonSelection = {
  strategyIds: [],
  assetIds: [],
  params: null,
};

/**
 * Dernière comparaison de l'utilisateur, épurée de ce qui n'existe plus.
 *
 * Le filtrage n'est pas une précaution de principe : une stratégie supprimée
 * depuis la dernière visite ferait échouer le calcul avec « une des stratégies
 * demandées est introuvable », sur un écran que l'utilisateur n'a pourtant fait
 * qu'ouvrir. Mieux vaut restaurer ce qui reste, quitte à ne rien restaurer.
 */
export async function getLastComparison(
  userId: string,
): Promise<ComparisonSelection> {
  const [row] = await db
    .select()
    .from(lastComparisons)
    .where(eq(lastComparisons.userId, userId))
    .limit(1);

  if (!row) return EMPTY_COMPARISON;

  const [ownedStrategies, existingAssets] = await Promise.all([
    row.strategyIds.length > 0
      ? db
          .select({ id: strategies.id })
          .from(strategies)
          .where(
            and(
              eq(strategies.userId, userId),
              inArray(strategies.id, row.strategyIds),
            ),
          )
      : Promise.resolve([]),
    row.assetIds.length > 0
      ? db
          .select({ id: assets.id })
          .from(assets)
          .where(inArray(assets.id, row.assetIds))
      : Promise.resolve([]),
  ]);

  const owned = new Set(ownedStrategies.map((s) => s.id));
  const existing = new Set(existingAssets.map((a) => a.id));

  return {
    // L'ordre enregistré est conservé : il détermine celui des colonnes et des
    // couleurs, et une comparaison qui se réordonne toute seule d'une visite à
    // l'autre serait déroutante.
    strategyIds: row.strategyIds.filter((id) => owned.has(id)),
    assetIds: row.assetIds.filter((id) => existing.has(id)),
    params: row.params,
  };
}

export async function saveLastComparison(
  userId: string,
  selection: ComparisonSelection,
): Promise<void> {
  await db
    .insert(lastComparisons)
    .values({
      userId,
      strategyIds: selection.strategyIds,
      assetIds: selection.assetIds,
      params: selection.params,
    })
    .onConflictDoUpdate({
      target: lastComparisons.userId,
      set: {
        strategyIds: selection.strategyIds,
        assetIds: selection.assetIds,
        params: selection.params,
        updatedAt: new Date(),
      },
    });
}
