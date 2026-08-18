import {
  METRIC_THRESHOLDS,
  type MetricKey,
  type MetricThreshold,
  type ScoreLevel,
} from "./thresholds";
import type { BacktestMetrics } from "./types";

export interface MetricScore {
  key: MetricKey;
  /** `null` quand la métrique elle-même n'est pas définie. */
  value: number | null;
  /** `null` quand il n'y a rien à noter. */
  level: ScoreLevel | null;
  levelLabel: string | null;
  threshold: MetricThreshold;
}

/**
 * Situe une valeur sur l'échelle à cinq niveaux de sa métrique.
 *
 * Les bornes sont toujours écrites en ordre croissant ; c'est
 * `higherIsBetter` qui décide si le haut de l'échelle correspond au niveau 5 ou
 * au niveau 1. Écrire les bornes dans un seul sens évite les inversions de
 * signe dans les seuils de baisse maximale, qui sont négatifs.
 */
export function levelFor(
  value: number,
  threshold: MetricThreshold,
): ScoreLevel {
  let bucket = 0;
  for (const bound of threshold.bounds) {
    if (value >= bound) bucket += 1;
  }

  const level = threshold.higherIsBetter ? bucket + 1 : 5 - bucket;
  return Math.min(5, Math.max(1, level)) as ScoreLevel;
}

export function scoreMetric(
  key: MetricKey,
  value: number | null,
): MetricScore {
  const threshold = METRIC_THRESHOLDS[key];

  if (value === null || !Number.isFinite(value)) {
    return { key, value: null, level: null, levelLabel: null, threshold };
  }

  const level = levelFor(value, threshold);
  return {
    key,
    value,
    level,
    levelLabel: threshold.levelLabels[level - 1],
    threshold,
  };
}

/** Toutes les métriques notables d'un backtest, dans l'ordre d'affichage. */
export function scoreAllMetrics(metrics: BacktestMetrics): MetricScore[] {
  return [
    scoreMetric("cagr", metrics.cagr),
    scoreMetric("volatility", metrics.volatility),
    scoreMetric("maxDrawdown", metrics.drawdown.maxDrawdown),
    scoreMetric("sharpe", metrics.sharpe),
    scoreMetric("sortino", metrics.sortino),
    scoreMetric("calmar", metrics.calmar),
    scoreMetric("weightedTer", metrics.weightedTer),
  ];
}
