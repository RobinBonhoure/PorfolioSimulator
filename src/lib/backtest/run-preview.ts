import { inArray } from "drizzle-orm";

import { inflationCoverageWarning } from "@/lib/data-fetching/inflation/loader";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { BacktestError, runBacktest } from "@/lib/engine/run-backtest";
import type { BacktestResult, StrategyParams } from "@/lib/engine/types";
import { downsampleResult } from "./downsample";
import { prepareEngineInput, type EngineWindow } from "./prepare-input";
import type { ResultAssetInfo } from "./run-for-strategy";

/**
 * Backtest d'une allocation qui n'existe pas en base.
 *
 * Le parcours guidé propose avant de créer : il faut donc pouvoir chiffrer trois
 * allocations sans les enregistrer, sinon la liste de l'utilisateur se
 * remplirait de stratégies qu'il n'a pas choisies.
 *
 * Rien n'est lu ni écrit qui appartienne à un utilisateur — ni stratégie, ni
 * cache de métriques. Seul le cache de cours, partagé et non nominatif, est
 * alimenté. L'appelant doit tout de même exiger une session : le calcul déclenche
 * des récupérations chez Yahoo, et l'exposer sans authentification en ferait un
 * relais ouvert.
 */
export interface PreviewInput {
  params: StrategyParams;
  /** Poids en fraction, sommant à 1. */
  selection: readonly { assetId: string; targetWeight: number }[];
  /** Mettre à faux pour obtenir les séries quotidiennes intégrales, dont la
   *  comparaison a besoin pour aligner les courbes sur un calendrier commun. */
  downsample?: boolean;
  /** Fenêtre imposée, en remplacement de celle déduite de la durée. */
  window?: EngineWindow | null;
}

export interface PreviewResponse {
  result: BacktestResult;
  assets: ResultAssetInfo[];
  benchmarkLabel: string | null;
  warnings: string[];
}

export async function runBacktestPreview(
  input: PreviewInput,
): Promise<PreviewResponse> {
  if (input.selection.length === 0) {
    throw new BacktestError("Cette allocation ne contient aucun actif.");
  }

  const rows = await db
    .select()
    .from(assets)
    .where(
      inArray(
        assets.id,
        input.selection.map((entry) => entry.assetId),
      ),
    );

  const byId = new Map(rows.map((row) => [row.id, row]));
  if (input.selection.some((entry) => !byId.has(entry.assetId))) {
    throw new BacktestError("Un des actifs proposés n'existe plus au catalogue.");
  }

  const prepared = await prepareEngineInput({
    selection: input.selection.map((entry) => ({ ...entry })),
    params: input.params,
    benchmarkTicker: input.params.benchmark,
    window: input.window,
  });

  const result = runBacktest(prepared.input);

  const warnings = [...prepared.warnings];
  if (input.params.realReturns) {
    const coverage = inflationCoverageWarning(result.metrics.endDate);
    if (coverage) warnings.push(coverage);
  }

  return {
    result: input.downsample === false ? result : downsampleResult(result),
    assets: input.selection.map((entry) => {
      const asset = byId.get(entry.assetId)!;
      return {
        id: asset.id,
        label: asset.shortLabel,
        name: asset.name,
        ticker: asset.tickerYahoo,
        type: asset.type,
        peaEligible: asset.peaEligible,
        ter: asset.ter === null ? null : Number(asset.ter),
        targetWeight: entry.targetWeight,
        sectorBreakdown: asset.sectorBreakdown,
        geoBreakdown: asset.geoBreakdown,
        dataPartial: asset.dataPartial,
      };
    }),
    benchmarkLabel: prepared.input.benchmark?.label ?? null,
    warnings,
  };
}
