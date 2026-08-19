"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { StrategyBacktestResponse } from "@/lib/backtest/run-for-strategy";
import type { YoungAssetResolution } from "@/lib/engine/types";

/**
 * Backtest d'une stratégie.
 *
 * `draftJson` porte des paramètres saisis mais pas encore enregistrés, déjà
 * sérialisés : c'est ce qui permet de s'en servir tel quel comme clé de requête,
 * là où un objet reconstruit à chaque rendu invaliderait le cache en boucle.
 * Passer `null` calcule la stratégie telle qu'elle est en base.
 */
export function useBacktest(
  strategyId: string,
  youngAssetResolution: YoungAssetResolution | null,
  draftJson: string | null = null,
) {
  return useQuery<StrategyBacktestResponse>({
    queryKey: ["backtest", strategyId, youngAssetResolution, draftJson],
    queryFn: async () => {
      const response = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          youngAssetResolution,
          draft: draftJson === null ? null : JSON.parse(draftJson),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Le calcul a échoué.");
      }
      return payload;
    },
    // Le premier appel peut télécharger plusieurs historiques complets ;
    // réessayer automatiquement doublerait la charge sur Yahoo pour rien.
    retry: false,
    staleTime: 10 * 60 * 1000,
    // Chaque modification de paramètre change la clé de requête. Sans cela,
    // l'écran repasserait en squelette à chaque cran de curseur : on garde donc
    // les résultats précédents affichés, estompés, le temps du recalcul.
    placeholderData: keepPreviousData,
  });
}
