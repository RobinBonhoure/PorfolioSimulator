import { and, asc, eq, inArray } from "drizzle-orm";

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
import { prepareEngineInput, type EngineWindow } from "./prepare-input";

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

/**
 * Paramètres saisis mais pas encore enregistrés.
 *
 * L'écran de stratégie recalcule à chaque modification d'un curseur, bien avant
 * que l'utilisateur n'ait décidé de conserver la variante. Le brouillon est donc
 * calculé **sans jamais toucher la stratégie en base** : c'est ce qui permet
 * d'explorer une allocation sans détruire celle qu'on avait enregistrée.
 */
export interface BacktestDraft {
  params: StrategyParams;
  /** Poids en fraction, déjà renormalisés à 1 par `toSelection`. */
  selection: readonly { assetId: string; targetWeight: number }[];
}

export interface StrategyBacktestResponse {
  strategyId: string;
  strategyName: string;
  /** Paramètres effectivement utilisés : la projection en tire le versement
   *  mensuel proposé par défaut. */
  params: StrategyParams;
  result: BacktestResult;
  assets: ResultAssetInfo[];
  benchmarkLabel: string | null;
  warnings: string[];
  /** Vrai si les métriques proviennent du cache plutôt que d'un nouveau calcul. */
  fromCache: boolean;
  /** Vrai si le résultat porte sur un brouillon non enregistré. */
  isDraft: boolean;
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
  /** Paramètres saisis mais pas encore enregistrés. Quand il est fourni, la
   *  stratégie en base ne sert plus qu'à vérifier la propriété et à nommer le
   *  résultat : ni ses paramètres ni ses actifs ne sont lus, et rien n'est
   *  écrit. */
  draft?: BacktestDraft | null;
  /** Fenêtre imposée, en remplacement de celle déduite de la durée. Le résultat
   *  ne décrivant plus la stratégie telle qu'elle est paramétrée, il n'est
   *  jamais mis en cache. */
  window?: EngineWindow | null;
}): Promise<StrategyBacktestResponse> {
  const { strategyId, userId, draft } = options;

  const [strategy] = await db
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, strategyId), eq(strategies.userId, userId)))
    .limit(1);

  if (!strategy) {
    throw new BacktestError("Stratégie introuvable.");
  }

  const selection = draft
    ? draft.selection.map((entry) => ({ ...entry }))
    : (
        await db
          .select({
            assetId: strategyAssets.assetId,
            targetWeight: strategyAssets.targetWeight,
          })
          .from(strategyAssets)
          .where(eq(strategyAssets.strategyId, strategyId))
          .orderBy(asc(strategyAssets.sortOrder))
      ).map((row) => ({
        assetId: row.assetId,
        targetWeight: Number(row.targetWeight),
      }));

  if (selection.length === 0) {
    throw new BacktestError("Cette stratégie ne contient aucun actif.");
  }

  // Chargés en une requête puis réordonnés selon la sélection : `inArray` ne
  // garantit aucun ordre, et l'ordre des actifs détermine leurs couleurs.
  const assetById = new Map(
    (
      await db
        .select()
        .from(assets)
        .where(inArray(assets.id, selection.map((entry) => entry.assetId)))
    ).map((asset) => [asset.id, asset]),
  );

  const missing = selection.find((entry) => !assetById.has(entry.assetId));
  if (missing) {
    throw new BacktestError("Un des actifs sélectionnés n'existe plus.");
  }

  const baseParams = draft ? draft.params : strategy.params;
  const params: StrategyParams = {
    ...baseParams,
    youngAssetResolution:
      options.youngAssetResolution !== undefined
        ? options.youngAssetResolution
        : baseParams.youngAssetResolution,
  };

  const prepared = await prepareEngineInput({
    selection,
    params,
    benchmarkTicker: params.benchmark,
    window: options.window,
  });

  const result = runBacktest(prepared.input);

  const warnings = [...prepared.warnings];
  if (params.realReturns) {
    const coverage = inflationCoverageWarning(result.metrics.endDate);
    if (coverage) warnings.push(coverage);
  }

  // --- Mise en cache des métriques ------------------------------------------

  // Un brouillon n'est pas mis en cache : il ne décrit pas la stratégie
  // enregistrée, et les cards de `/strategies` lisent cette table. Y écrire
  // ferait afficher dans la liste des chiffres qui ne correspondent à aucun
  // état sauvegardé. Une fenêtre imposée est écartée pour la même raison : le
  // résultat porte sur une période choisie par l'appelant, pas sur la durée
  // paramétrée.
  if (!draft && !options.window) {
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
  }

  return {
    strategyId,
    strategyName: strategy.name,
    params,
    result: options.downsample === false ? result : downsampleResult(result),
    assets: selection.map((entry) => {
      const asset = assetById.get(entry.assetId)!;
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
    fromCache: false,
    isDraft: draft != null,
  };
}
