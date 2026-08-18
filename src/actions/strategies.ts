"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { strategies, strategyAssets } from "@/lib/db/schema";
import {
  strategyFormSchema,
  type StrategyFormValues,
} from "@/lib/validation/strategy.schema";
import { toEngineParams } from "@/lib/validation/to-engine-params";

/**
 * Écritures sur les stratégies.
 *
 * Chaque action revalide la session et vérifie la propriété de la stratégie,
 * sans exception. La documentation de Next 16 est explicite sur ce point : une
 * server action est une requête POST sur la route qui l'utilise, et un
 * ajustement du `matcher` de `proxy.ts` peut la soustraire au filtre sans que
 * rien ne le signale. L'autorisation ne peut donc pas être déléguée au proxy.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function formatIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => issue.message).join(" · ");
}

async function writeAssets(
  strategyId: string,
  values: StrategyFormValues,
): Promise<void> {
  await db.delete(strategyAssets).where(eq(strategyAssets.strategyId, strategyId));

  if (values.assets.length === 0) return;

  await db.insert(strategyAssets).values(
    values.assets.map((asset, index) => ({
      strategyId,
      assetId: asset.assetId,
      // Stocké en fraction, comme partout sous la frontière de validation.
      targetWeight: (asset.weightPercent / 100).toFixed(8),
      sortOrder: index,
    })),
  );
}

export async function createStrategy(
  input: StrategyFormValues,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = strategyFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }

  const values = parsed.data;

  const [created] = await db
    .insert(strategies)
    .values({
      userId: user.id,
      name: values.name,
      description: values.description ?? null,
      params: toEngineParams(values),
    })
    .returning({ id: strategies.id });

  await writeAssets(created.id, values);

  revalidatePath("/strategies");
  return { ok: true, data: { id: created.id } };
}

export async function updateStrategy(
  strategyId: string,
  input: StrategyFormValues,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = strategyFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatIssues(parsed.error.issues) };
  }

  const values = parsed.data;

  // La clause `and` porte l'autorisation : une stratégie appartenant à un autre
  // compte ne correspond simplement à aucune ligne.
  const updated = await db
    .update(strategies)
    .set({
      name: values.name,
      description: values.description ?? null,
      params: toEngineParams(values),
      updatedAt: new Date(),
    })
    .where(and(eq(strategies.id, strategyId), eq(strategies.userId, user.id)))
    .returning({ id: strategies.id });

  if (updated.length === 0) {
    return { ok: false, error: "Stratégie introuvable." };
  }

  await writeAssets(strategyId, values);

  revalidatePath("/strategies");
  revalidatePath(`/strategies/${strategyId}`);
  return { ok: true, data: { id: strategyId } };
}

export async function deleteStrategy(
  strategyId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const deleted = await db
    .delete(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.userId, user.id)))
    .returning({ id: strategies.id });

  if (deleted.length === 0) {
    return { ok: false, error: "Stratégie introuvable." };
  }

  revalidatePath("/strategies");
  return { ok: true, data: undefined };
}

export async function duplicateStrategy(
  strategyId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const [source] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.userId, user.id)))
    .limit(1);

  if (!source) return { ok: false, error: "Stratégie introuvable." };

  const sourceAssets = await db
    .select()
    .from(strategyAssets)
    .where(eq(strategyAssets.strategyId, strategyId));

  const [copy] = await db
    .insert(strategies)
    .values({
      userId: user.id,
      name: `${source.name} (copie)`,
      description: source.description,
      params: source.params,
    })
    .returning({ id: strategies.id });

  if (sourceAssets.length > 0) {
    await db.insert(strategyAssets).values(
      sourceAssets.map((asset) => ({
        strategyId: copy.id,
        assetId: asset.assetId,
        targetWeight: asset.targetWeight,
        sortOrder: asset.sortOrder,
      })),
    );
  }

  revalidatePath("/strategies");
  return { ok: true, data: { id: copy.id } };
}
