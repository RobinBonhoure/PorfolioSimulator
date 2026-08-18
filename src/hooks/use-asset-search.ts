"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { YahooSearchResult } from "@/lib/data-fetching/yahoo/search";
import type { AssetSearchResult } from "@/lib/db/queries/assets";

export interface AssetSearchResponse {
  catalog: AssetSearchResult[];
  yahoo: YahooSearchResult[];
  error?: string;
}

/** Laisse à l'utilisateur le temps de finir son mot avant d'interroger le serveur. */
const DEBOUNCE_MS = 200;

export function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useAssetSearch(query: string, includeYahoo = false) {
  const debounced = useDebounced(query);
  const enabled = debounced.trim().length >= 2;

  return useQuery<AssetSearchResponse>({
    queryKey: ["asset-search", debounced, includeYahoo],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ q: debounced.trim() });
      if (includeYahoo) params.set("fallback", "1");

      const response = await fetch(`/api/assets/search?${params}`);
      if (!response.ok) throw new Error("La recherche a échoué.");
      return response.json();
    },
    // Un catalogue curaté ne bouge pas en cours de session : conserver les
    // résultats évite de re-solliciter le serveur quand l'utilisateur revient
    // en arrière dans sa saisie.
    staleTime: 10 * 60 * 1000,
  });
}
