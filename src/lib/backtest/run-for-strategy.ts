import { and, asc, eq } from "drizzle-orm";

import { latestDataDate } from "@/lib/data-fetching/cache-orchestrator";
import { inflationCoverageWarning } from "@/lib/data-fetching/inflation/loader";
import { db } from "@/lib/db";
import { assets, backtestResults, strategies, strategyAssets } from "@/lib/db/schema";
import { BacktestError, runBacktest } from "@/lib/engine/run-backtest";
import type {
  BacktestResult,
  StrategyParams,
  YoungAssetResolution,
} from "@/lib/engine/types";
import { downsampleResult } from "./downsample";
import { computeParamsHash } from "./params-hash";
import { prepareEngineInput } from "./prepare-input";

/** Actif tel que présenté par l'écran de résultats. */
export interface ResultAssetInfo {
  id: string;
  label: string;
  name: string;
  ticker: string;
  type: string;
  peaEligible: boolean | null;
  ter: number | null;
  targetWeight: number;
  sectorBreakdown: Record<string, number> | null;
  geoBreakdown: Record<string, number> | null;
  dataPartial: boolean;
}

export interface StrategyBacktestResponse {
  strategyId: string;
  strategyName: string;
  result: BacktestResult;
  assets: ResultAssetInfo[];
  benchmarkLabel: string | null;
  warnings: string[];
  /** Vrai si les métriques proviennent du cache plutôt que d'un nouveau calcul. */
  fromCache: boolean;
}

/**
 * Calcule — ou récupère — le backtest d'une stratégie appartenant à un
 * utilisateur.
 *
 * Le cache ne porte que sur les **métriques** : les séries sont systématiquement
 * recalculées. C'est un choix mesuré et non une approximation — le moteur
 * traite trente ans sur dix actifs en moins de deux cents millisecondes, alors
 * que stocker les séries représenterait plusieurs méga-octets par exécution
 * pour une donnée entièrement redérivable du cache de cours.
 */
export async function runBacktestForStrategy(options: {
  strategyId: string;
  userId: string;
  /** Surcharge ponctuelle, quand l'utilisateur arbitre sur les actifs jeunes. */
  youngAssetResolution?: YoungAssetResolution | null;
  /** Mettre à faux pour obtenir les séries quotidiennes intégrales. La
   *  comparaison en a besoin : allégée en amont, chaque stratégie serait
   *  échantillonnée sur des dates différentes et les courbes ne seraient plus
   *  superposables. Elle allège elle-même le résultat fusionné. */
  downsample?: boolean;
}): Promise<StrategyBacktestResponse> {
  const { strategyId, userId } = options;

  const [strategy] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.userId, userId)))
    .limit(1);

  if (!strategy) {
    throw new BacktestError("Stratégie introuvable.");
  }

  const rows = await db
    .select({
      asset: assets,
      targetWeight: strategyAssets.targetWeight,
      sortOrder: strategyAssets.sortOrder,
    })
    .from(strategyAssets)
    .innerJoin(assets, eq(assets.id, strategyAssets.assetId))
    .where(eq(strategyAssets.strategyId, strategyId))
    .orderBy(asc(strategyAssets.sortOrder));

  if (rows.length === 0) {
    throw new BacktestError("Cette stratégie ne contient aucun actif.");
  }

  const params: StrategyParams = {
    ...strategy.params,
    youngAssetResolution:
      options.youngAssetResolution !== undefined
        ? options.youngAssetResolution
        : strategy.params.youngAssetResolution,
  };

  const selection = rows.map((row) => ({
    assetId: row.asset.id,
    targetWeight: Number(row.targetWeight),
  }));

  const prepared = await prepareEngineInput({
    selection,
    params,
    benchmarkTicker: params.benchmark,
  });

  const result = runBacktest(prepared.input);

  const warnings = [...prepared.warnings];
  if (params.realReturns) {
    const coverage = inflationCoverageWarning(result.metrics.endDate);
    if (coverage) warnings.push(coverage);
  }

  // --- Mise en cache des métriques ------------------------------------------

  const paramsHash = computeParamsHash(params, selection);
  const dataThrough =
    (await latestDataDate(selection.map((s) => s.assetId))) ??
    result.metrics.endDate;

  await db
    .insert(backtestResults)
    .values({
      strategyId,
      paramsHash,
      dataThroughDate: dataThrough,
      metrics: result.metrics,
    })
    .onConflictDoUpdate({
      target: [
        backtestResults.strategyId,
        backtestResults.paramsHash,
        backtestResults.dataThroughDate,
      ],
      set: { metrics: result.metrics, computedAt: new Date() },
    });

  const weightById = new Map(selection.map((s) => [s.assetId, s.targetWeight]));

  return {
    strategyId,
    strategyName: strategy.name,
    result: options.downsample === false ? result : downsampleResult(result),
    assets: rows.map((row) => ({
      id: row.asset.id,
      label: row.asset.shortLabel,
      name: row.asset.name,
      ticker: row.asset.tickerYahoo,
      type: row.asset.type,
      peaEligible: row.asset.peaEligible,
      ter: row.asset.ter === null ? null : Number(row.asset.ter),
      targetWeight: weightById.get(row.asset.id) ?? 0,
      sectorBreakdown: row.asset.sectorBreakdown,
      geoBreakdown: row.asset.geoBreakdown,
      dataPartial: row.asset.dataPartial,
    })),
    benchmarkLabel: prepared.input.benchmark?.label ?? null,
    warnings,
    fromCache: false,
  };
}
