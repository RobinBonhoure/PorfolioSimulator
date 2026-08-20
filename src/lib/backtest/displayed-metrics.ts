import type { BacktestMetrics } from "@/lib/engine/types";

/**
 * Métriques telles qu'affichées, selon que l'utilisateur a demandé ou non le
 * rendement réel.
 *
 * Le moteur produit systématiquement les deux jeux ; c'est ici qu'on décide
 * lequel est montré. La bascule d'inflation ne changeait auparavant qu'une
 * mention discrète sous la valeur finale — les ratios notés, la volatilité, la
 * baisse maximale et les trois graphiques restaient en euros courants, alors
 * que l'étiquette du réglage annonçait « déflaté de l'inflation ». Substituer
 * le jeu complet est la seule lecture qui corresponde à ce que le réglage
 * promet.
 */
export function displayedMetrics(
  metrics: BacktestMetrics,
  realMode: boolean,
): BacktestMetrics {
  if (!realMode || !metrics.real) return metrics;

  // `annualInflation` n'appartient pas au jeu nominal : il est retiré de la
  // fusion et reste accessible via `metrics.real` pour l'affichage du taux.
  const { annualInflation: _inflation, ...real } = metrics.real;
  return { ...metrics, ...real };
}

/** Vrai quand l'affichage doit basculer en euros constants. */
export function isRealMode(
  realReturns: boolean,
  metrics: BacktestMetrics,
): boolean {
  return realReturns && metrics.real != null;
}
