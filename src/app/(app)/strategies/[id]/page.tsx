import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import type { EditorAsset } from "@/components/strategy-editor/types";
import { StrategyWorkspace } from "@/components/workspace/strategy-workspace";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listCatalogAssets } from "@/lib/db/queries/assets";
import { getStrategyForUser } from "@/lib/db/queries/strategies";
import { assets, strategyAssets } from "@/lib/db/schema";
import { fromEngineParams } from "@/lib/validation/to-engine-params";

export default async function StrategyPage({
  params,
}: PageProps<"/strategies/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  // `getStrategyForUser` filtre déjà sur l'utilisateur : une stratégie
  // appartenant à quelqu'un d'autre ressort comme inexistante, sans que la
  // réponse ne permette de distinguer les deux cas.
  const strategy = await getStrategyForUser(id, user.id);
  if (!strategy) notFound();

  const rows = await db
    .select({ asset: assets, targetWeight: strategyAssets.targetWeight })
    .from(strategyAssets)
    .innerJoin(assets, eq(assets.id, strategyAssets.assetId))
    .where(eq(strategyAssets.strategyId, id))
    .orderBy(asc(strategyAssets.sortOrder));

  const editorAssets: EditorAsset[] = rows.map((row) => ({
    assetId: row.asset.id,
    tickerYahoo: row.asset.tickerYahoo,
    shortLabel: row.asset.shortLabel,
    type: row.asset.type,
    peaEligible: row.asset.peaEligible,
    ter: row.asset.ter === null ? null : Number(row.asset.ter),
    currency: row.asset.currency,
    dataPartial: row.asset.dataPartial,
    // Repassage en pourcentage pour l'affichage ; l'arrondi au centième évite
    // les 59.999999999 que produirait la conversion depuis le numeric stocké.
    weightPercent: Number((Number(row.targetWeight) * 100).toFixed(2)),
  }));

  const catalog = await listCatalogAssets();

  return (
    <StrategyWorkspace
      strategyId={id}
      catalog={catalog}
      initialAssets={editorAssets}
      savedResolution={strategy.params.youngAssetResolution ?? null}
      initialValues={{
        ...fromEngineParams(strategy.params),
        name: strategy.name,
        description: strategy.description ?? undefined,
        assets: editorAssets.map((asset) => ({
          assetId: asset.assetId,
          weightPercent: asset.weightPercent,
        })),
      }}
    />
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/strategies/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const strategy = await getStrategyForUser(id, user.id);

  return {
    title: strategy
      ? `${strategy.name} — Simulateur de portefeuille`
      : "Stratégie introuvable",
  };
}
