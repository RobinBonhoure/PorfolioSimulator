"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssetSearch } from "@/hooks/use-asset-search";
import { formatPercent } from "@/lib/utils/format";
import { PeaBadge } from "./pea-badge";
import type { EditorAsset } from "./types";

const TYPE_LABELS: Record<string, string> = {
  etf: "ETF",
  stock: "Action",
  crypto: "Crypto",
  metal: "Métal",
};

export function AssetSearchBar({
  selectedIds,
  onAdd,
  onAddFromYahoo,
  disabled,
}: {
  selectedIds: readonly string[];
  onAdd: (asset: EditorAsset) => void;
  onAddFromYahoo: (symbol: string, name: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [wantYahoo, setWantYahoo] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const { data, isFetching } = useAssetSearch(query, wantYahoo);

  const catalog = (data?.catalog ?? []).filter(
    (result) => !selectedIds.includes(result.id),
  );
  const showResults = query.trim().length >= 2;
  const catalogEmpty = showResults && !isFetching && catalog.length === 0;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Toute nouvelle saisie repart du catalogue : la recherche étendue
            // est un geste explicite, pas un état qui persiste.
            setWantYahoo(false);
          }}
          placeholder="Rechercher un actif : nom, ticker ou ISIN…"
          className="pl-8"
          disabled={disabled}
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showResults && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {catalog.map((result) => (
            <button
              key={result.id}
              type="button"
              className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-secondary/60"
              onClick={() => {
                onAdd({
                  assetId: result.id,
                  tickerYahoo: result.tickerYahoo,
                  shortLabel: result.shortLabel,
                  type: result.type,
                  peaEligible: result.peaEligible,
                  ter: result.ter === null ? null : Number(result.ter),
                  currency: result.currency,
                  dataPartial: result.dataPartial,
                  weightPercent: 0,
                });
                setQuery("");
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {result.shortLabel}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {result.name}
                  {result.isin ? ` · ${result.isin}` : ""}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {TYPE_LABELS[result.type] ?? result.type}
              </span>
              <span className="tnum w-14 text-right text-xs text-muted-foreground">
                {result.ter === null ? "—" : formatPercent(Number(result.ter))}
              </span>
              <PeaBadge eligible={result.peaEligible} />
            </button>
          ))}

          {catalogEmpty && !wantYahoo && (
            <div className="space-y-2 px-3 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun actif du catalogue ne correspond.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setWantYahoo(true)}
              >
                Rechercher sur Yahoo Finance
              </Button>
            </div>
          )}

          {wantYahoo && data?.error && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {data.error}
            </p>
          )}

          {wantYahoo &&
            (data?.yahoo ?? []).map((result) => (
              <div
                key={result.symbol}
                className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{result.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {result.symbol}
                    {result.exchange ? ` · ${result.exchange}` : ""} · données
                    partielles
                  </span>
                </span>
                <PeaBadge eligible={null} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={adding === result.symbol}
                  onClick={async () => {
                    setAdding(result.symbol);
                    try {
                      await onAddFromYahoo(result.symbol, result.name);
                      setQuery("");
                    } finally {
                      setAdding(null);
                    }
                  }}
                >
                  {adding === result.symbol ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
              </div>
            ))}

          {wantYahoo && !isFetching && (data?.yahoo ?? []).length === 0 && !data?.error && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Yahoo Finance ne connaît pas cet actif non plus.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
