"use client";

import { Sparkles } from "lucide-react";

import type { CatalogAsset } from "@/lib/db/queries/assets";
import { PRESET_ALLOCATIONS } from "@/lib/presets/allocations";
import { formatPercent } from "@/lib/utils/format";
import { PeaBadge } from "./pea-badge";
import type { EditorAsset } from "./types";

/**
 * Allocations types proposées sur une allocation vide.
 *
 * Répond à la vraie question du débutant — « par quoi je commence ? » — plutôt
 * qu'à « comment je trouve tel ETF ». Un clic produit une stratégie complète et
 * modifiable, ce qui vaut mieux qu'un écran vide et une barre de recherche.
 *
 * Chaque modèle affiche sa composition et sa raison d'être : sans cela, on ne
 * ferait que déplacer la question un cran plus loin.
 *
 * Les modèles dont un support manque au catalogue sont masqués plutôt que
 * proposés puis mis en échec au clic.
 */
export function PresetPicker({
  catalog,
  onApply,
}: {
  catalog: CatalogAsset[];
  onApply: (assets: EditorAsset[], name: string) => void;
}) {
  const byTicker = new Map(catalog.map((asset) => [asset.tickerYahoo, asset]));

  const available = PRESET_ALLOCATIONS.filter((preset) =>
    preset.holdings.every((holding) => byTicker.has(holding.ticker)),
  );

  if (available.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-3.5" />
        Partir d&apos;une allocation type
      </p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {available.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              className="flex h-full w-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:bg-secondary/60"
              onClick={() =>
                onApply(
                  preset.holdings.map((holding) => {
                    const asset = byTicker.get(holding.ticker)!;
                    return {
                      assetId: asset.id,
                      tickerYahoo: asset.tickerYahoo,
                      shortLabel: asset.shortLabel,
                      type: asset.type,
                      peaEligible: asset.peaEligible,
                      ter: asset.ter === null ? null : Number(asset.ter),
                      currency: asset.currency,
                      dataPartial: asset.dataPartial,
                      weightPercent: holding.weightPercent,
                    };
                  }),
                  preset.name,
                )
              }
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{preset.name}</span>
                <PeaBadge eligible={preset.peaEligible ? true : false} />
              </span>

              <span className="text-[11px] leading-snug text-muted-foreground">
                {preset.rationale}
              </span>

              <span className="mt-auto flex flex-wrap gap-x-2 gap-y-0.5 pt-1 text-[11px] text-muted-foreground">
                {preset.holdings.map((holding) => {
                  const asset = byTicker.get(holding.ticker)!;
                  return (
                    <span key={holding.ticker} className="tnum">
                      {asset.shortLabel} {formatPercent(holding.weightPercent / 100, 0)}
                    </span>
                  );
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
