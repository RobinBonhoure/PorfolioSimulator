"use client";

import { useQueries } from "@tanstack/react-query";

import type { PreviewResponse } from "@/lib/backtest/run-preview";
import type { StrategyParams } from "@/lib/engine/types";

export interface PreviewRequest {
  key: string;
  params: StrategyParams;
  selection: { assetId: string; targetWeight: number }[];
}

async function fetchPreview(request: PreviewRequest): Promise<PreviewResponse> {
  const response = await fetch("/api/backtest/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft: { params: request.params, selection: request.selection },
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Le calcul a échoué.");
  return payload;
}

/**
 * Backtests des allocations proposées, un par proposition.
 *
 * `useQueries` plutôt qu'une requête unique renvoyant les trois : chaque
 * proposition s'affiche dès qu'elle est prête, au lieu de faire attendre les
 * trois sur la plus lente. Le premier appel peut télécharger l'historique
 * d'actifs jamais consultés.
 */
export function useBacktestPreviews(requests: PreviewRequest[]) {
  return useQueries({
    queries: requests.map((request) => ({
      queryKey: ["backtest-preview", request.key],
      queryFn: () => fetchPreview(request),
      retry: false,
      staleTime: 10 * 60 * 1000,
    })),
  });
}
