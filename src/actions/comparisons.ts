"use server";

import { requireUser } from "@/lib/auth/session";
import { saveLastComparison } from "@/lib/db/queries/comparisons";
import type { StrategyParams } from "@/lib/engine/types";
import { engineParamsSchema } from "@/lib/validation/backtest.schema";
import type { ActionResult } from "./strategies";

/**
 * Mémorise la comparaison courante comme celle à restaurer.
 *
 * Le calcul, lui, reste immédiat : la comparaison se recalcule dès qu'on change
 * un paramètre ou un élément. Ce que ce bouton fige, c'est **ce qu'on
 * retrouvera à la prochaine visite** — on peut donc essayer une variante de
 * plan sans écraser celle qu'on avait retenue.
 *
 * La validation reprend celle de la route de calcul : les paramètres viennent
 * du navigateur, et une server action est une requête POST comme une autre.
 */
export async function rememberComparison(input: {
  strategyIds: string[];
  assetIds: string[];
  params: StrategyParams;
}): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = engineParamsSchema.safeParse(input.params);

  if (!parsed.success) {
    return { ok: false, error: "Paramètres de comparaison invalides." };
  }

  await saveLastComparison(user.id, {
    strategyIds: input.strategyIds.slice(0, 4),
    assetIds: input.assetIds.slice(0, 4),
    params: parsed.data,
  });

  return { ok: true, data: undefined };
}
