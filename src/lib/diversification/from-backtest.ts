import type { ResultAssetInfo } from "@/lib/backtest/run-for-strategy";
import type { CorrelationMatrix } from "@/lib/engine/analytics";
import { analyseDiversification } from "./score";
import type { DiversificationReport, DiversifiableHolding } from "./types";

/**
 * Passerelle entre un résultat de backtest et l'analyse de robustesse.
 *
 * Le module d'analyse ignore volontairement les types du moteur — il doit
 * pouvoir tourner sur une allocation qui n'existe pas encore. La conversion vit
 * donc ici, seule à connaître les deux côtés.
 */

/**
 * Corrélation moyenne entre lignes distinctes.
 *
 * Moyenne du triangle supérieur, diagonale exclue : la diagonale vaut 1 par
 * construction et tirerait mécaniquement la moyenne vers le haut, d'autant plus
 * fort que le portefeuille compte peu de lignes. Renvoie `null` sous deux
 * lignes, où la notion n'existe pas.
 */
export function averageCorrelation(
  correlation: CorrelationMatrix | null,
): number | null {
  if (!correlation) return null;

  const { matrix } = correlation;
  if (matrix.length < 2) return null;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix.length; j += 1) {
      const value = matrix[i][j];
      if (!Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
  }

  return count === 0 ? null : sum / count;
}

export function toDiversifiableHoldings(
  assets: readonly ResultAssetInfo[],
): DiversifiableHolding[] {
  return assets.map((asset) => ({
    id: asset.id,
    label: asset.label,
    weight: asset.targetWeight,
    assetClass: asset.assetClass,
    trackedIndex: asset.trackedIndex,
    ter: asset.ter,
    geoBreakdown: asset.geoBreakdown,
    sectorBreakdown: asset.sectorBreakdown,
    capBreakdown: asset.capBreakdown,
  }));
}

export function analyseBacktestedStrategy(
  assets: readonly ResultAssetInfo[],
  correlation: CorrelationMatrix | null,
): DiversificationReport {
  return analyseDiversification(toDiversifiableHoldings(assets), {
    correlation: averageCorrelation(correlation),
  });
}
