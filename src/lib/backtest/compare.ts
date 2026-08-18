import { getOwnedStrategyIds } from "@/lib/db/queries/strategies";
import { BacktestError } from "@/lib/engine/run-backtest";
import type { BacktestMetrics, IsoDate } from "@/lib/engine/types";
import { sectorBreakdown, geoBreakdown, collapseTail } from "./breakdowns";
import type { BreakdownSlice } from "./breakdowns";
import { runBacktestForStrategy, type ResultAssetInfo } from "./run-for-strategy";

/**
 * Comparaison de deux à quatre stratégies.
 *
 * Deux précautions déterminent la validité de l'exercice :
 *
 * 1. **Période commune.** Une stratégie contenant un ETF né en 2019 ne peut pas
 *    être comparée sur vingt ans à une stratégie d'actions cotées depuis 2000.
 *    On retient l'intersection des périodes et on tronque tout le monde
 *    dessus — sinon on comparerait des rendements couvrant des marchés
 *    différents, ce qui ne veut rien dire.
 *
 * 2. **Base commune.** Les courbes sont ramenées à 100 au premier jour de cette
 *    période. Les capitaux initiaux et les versements diffèrent d'une stratégie
 *    à l'autre ; superposer des montants en euros comparerait des plans
 *    d'épargne, pas des allocations.
 */

export interface ComparisonPoint {
  date: IsoDate;
  /** Valeur base 100 par identifiant de stratégie. */
  [strategyId: string]: number | string;
}

export interface ComparedStrategy {
  id: string;
  name: string;
  metrics: BacktestMetrics;
  assets: ResultAssetInfo[];
  sectors: BreakdownSlice[];
  geography: BreakdownSlice[];
}

export interface ComparisonResult {
  strategies: ComparedStrategy[];
  /** Courbes normalisées base 100 sur la période commune. */
  series: ComparisonPoint[];
  /** Courbes underwater, en fraction négative. */
  drawdowns: ComparisonPoint[];
  commonStart: IsoDate;
  commonEnd: IsoDate;
  /** Stratégies dont la période propre était plus longue que la commune. */
  truncated: string[];
  warnings: string[];
}

const MIN_STRATEGIES = 2;
const MAX_STRATEGIES = 4;

/** Points transmis au navigateur pour les courbes superposées. */
const MAX_CHART_POINTS = 1_200;

/** Indices régulièrement espacés, bornes comprises. */
function sampleIndices(length: number): number[] {
  if (length <= MAX_CHART_POINTS) {
    return Array.from({ length }, (_, i) => i);
  }

  const stride = (length - 1) / (MAX_CHART_POINTS - 1);
  const kept = new Set<number>([0, length - 1]);
  for (let i = 0; i < MAX_CHART_POINTS; i += 1) {
    kept.add(Math.round(i * stride));
  }

  return [...kept].sort((a, b) => a - b);
}

export async function compareStrategies(
  strategyIds: readonly string[],
  userId: string,
): Promise<ComparisonResult> {
  const unique = [...new Set(strategyIds)];

  if (unique.length < MIN_STRATEGIES || unique.length > MAX_STRATEGIES) {
    throw new BacktestError(
      `La comparaison porte sur ${MIN_STRATEGIES} à ${MAX_STRATEGIES} stratégies.`,
    );
  }

  // Vérification de propriété avant tout calcul : inutile de solliciter Yahoo
  // pour une stratégie qui n'appartient pas au demandeur.
  const owned = new Set(await getOwnedStrategyIds(unique, userId));
  const missing = unique.filter((id) => !owned.has(id));
  if (missing.length > 0) {
    throw new BacktestError("Une des stratégies demandées est introuvable.");
  }

  const runs = [];
  for (const strategyId of unique) {
    runs.push(
      await runBacktestForStrategy({
        strategyId,
        userId,
        // Séries intégrales : l'allègement intervient une fois les courbes
        // fusionnées, sur un calendrier unique.
        downsample: false,
      }),
    );
  }

  // --- Période commune ------------------------------------------------------

  const commonStart = runs.reduce<IsoDate>(
    (latest, run) =>
      run.result.metrics.startDate > latest ? run.result.metrics.startDate : latest,
    runs[0].result.metrics.startDate,
  );
  const commonEnd = runs.reduce<IsoDate>(
    (earliest, run) =>
      run.result.metrics.endDate < earliest ? run.result.metrics.endDate : earliest,
    runs[0].result.metrics.endDate,
  );

  if (commonStart >= commonEnd) {
    throw new BacktestError(
      "Ces stratégies n'ont aucune période en commun : leurs historiques ne se recouvrent pas.",
    );
  }

  const truncated = runs
    .filter((run) => run.result.metrics.startDate < commonStart)
    .map((run) => run.strategyName);

  // --- Normalisation base 100 ----------------------------------------------

  const dateSet = new Set<IsoDate>();
  for (const run of runs) {
    for (const point of run.result.series.portfolio) {
      if (point.date >= commonStart && point.date <= commonEnd) {
        dateSet.add(point.date);
      }
    }
  }
  const dates = [...dateSet].sort();

  const series: ComparisonPoint[] = dates.map((date) => ({ date }));
  const drawdowns: ComparisonPoint[] = dates.map((date) => ({ date }));

  for (const run of runs) {
    const byDate = new Map(
      run.result.series.portfolio.map((point) => [point.date, point]),
    );

    // La valeur du portefeuille intègre les versements ; pour comparer des
    // allocations et non des plans d'épargne, on reconstruit un indice à partir
    // des rendements pondérés par le temps, comme le fait le moteur pour ses
    // métriques.
    let previousValue: number | null = null;
    let previousInvested = 0;
    let level = 100;
    let peak = 100;

    for (let i = 0; i < dates.length; i += 1) {
      const point = byDate.get(dates[i]);
      if (!point) {
        // Jour coté pour une stratégie mais pas pour une autre : on reporte le
        // dernier niveau connu plutôt que de trouer la courbe.
        series[i][run.strategyId] = level;
        drawdowns[i][run.strategyId] = level / peak - 1;
        continue;
      }

      if (previousValue !== null && previousValue > 0) {
        const contribution = point.invested - previousInvested;
        level *= (point.value - contribution) / previousValue;
      }

      previousValue = point.value;
      previousInvested = point.invested;

      if (level > peak) peak = level;

      series[i][run.strategyId] = level;
      drawdowns[i][run.strategyId] = level / peak - 1;
    }
  }

  // Allègement une fois les courbes alignées : toutes partagent désormais le
  // même calendrier, l'échantillonnage les conserve donc superposables.
  const keep = sampleIndices(dates.length);

  return {
    strategies: runs.map((run) => ({
      id: run.strategyId,
      name: run.strategyName,
      metrics: run.result.metrics,
      assets: run.assets,
      sectors: collapseTail(sectorBreakdown(run.assets), 6),
      geography: collapseTail(geoBreakdown(run.assets), 6),
    })),
    series: keep.map((i) => series[i]),
    drawdowns: keep.map((i) => drawdowns[i]),
    commonStart,
    commonEnd,
    truncated,
    warnings: [...new Set(runs.flatMap((run) => run.warnings))],
  };
}
