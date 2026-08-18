"use client";

import { useQuery } from "@tanstack/react-query";

import type { StrategyBacktestResponse } from "@/lib/backtest/run-for-strategy";
import type { YoungAssetResolution } from "@/lib/engine/types";

export function useBacktest(
  strategyId: string,
  youngAssetResolution: YoungAssetResolution | null,
) {
  return useQuery<StrategyBacktestResponse>({
    queryKey: ["backtest", strategyId, youngAssetResolution],
    queryFn: async () => {
      const response = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId, youngAssetResolution }),
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
  });
}
