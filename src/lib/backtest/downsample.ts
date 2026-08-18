import type { BacktestResult, BacktestSeries, IsoDate } from "@/lib/engine/types";

/**
 * Allègement des séries envoyées au navigateur.
 *
 * Trente ans de cotations quotidiennes sur dix actifs représentent plusieurs
 * méga-octets de JSON, pour un graphique large de mille pixels au plus : il y
 * aurait sept points par pixel. On n'en transmet donc qu'un échantillon.
 *
 * Point essentiel : **les métriques sont calculées sur la série complète**,
 * avant tout allègement. Seul le tracé est échantillonné. Un drawdown mesuré
 * sur une série amincie serait sous-estimé, ce qui est exactement le genre
 * d'erreur invisible qu'il faut éviter.
 *
 * Les dates remarquables — sommet et creux du plus fort drawdown — sont
 * réintroduites de force, sinon l'échantillonnage régulier raboterait
 * visuellement le point le plus intéressant du graphique.
 */

/** Un peu plus que la largeur en pixels d'un graphique plein écran. */
const MAX_POINTS = 1_200;

function sampleIndices(
  length: number,
  mustKeep: readonly number[],
): number[] {
  if (length <= MAX_POINTS) {
    return Array.from({ length }, (_, i) => i);
  }

  const stride = (length - 1) / (MAX_POINTS - 1);
  const kept = new Set<number>();

  for (let i = 0; i < MAX_POINTS; i += 1) {
    kept.add(Math.round(i * stride));
  }

  // Bornes et points remarquables, quoi qu'il arrive.
  kept.add(0);
  kept.add(length - 1);
  for (const index of mustKeep) {
    if (index >= 0 && index < length) kept.add(index);
  }

  return [...kept].sort((a, b) => a - b);
}

export function downsampleResult(result: BacktestResult): BacktestResult {
  const { portfolio } = result.series;
  if (portfolio.length <= MAX_POINTS) return result;

  const indexOfDate = (date: IsoDate | null): number =>
    date === null ? -1 : portfolio.findIndex((point) => point.date === date);

  const indices = sampleIndices(portfolio.length, [
    indexOfDate(result.metrics.drawdown.peakDate),
    indexOfDate(result.metrics.drawdown.troughDate),
    indexOfDate(result.metrics.drawdown.recoveryDate),
  ]);

  const series: BacktestSeries = {
    portfolio: indices.map((i) => portfolio[i]),
    byAsset: indices.map((i) => result.series.byAsset[i]),
    benchmark: result.series.benchmark
      ? indices.map((i) => result.series.benchmark![i])
      : null,
  };

  return { ...result, series };
}
