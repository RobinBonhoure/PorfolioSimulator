import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { EditorShell } from "@/components/strategy-editor/editor-shell";
import type { EditorAsset } from "@/components/strategy-editor/types";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assets, strategyAssets } from "@/lib/db/schema";
import { getStrategyForUser } from "@/lib/db/queries/strategies";
import { fromEngineParams } from "@/lib/validation/to-engine-params";

export const metadata = { title: "Modifier — Simulateur de portefeuille" };

export default async function EditStrategyPage({
  params,
}: PageProps<"/strategies/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;

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

  return (
    <EditorShell
      strategyId={id}
      initialAssets={editorAssets}
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
