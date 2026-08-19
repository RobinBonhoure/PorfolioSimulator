"use client";

import { Scale, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { formatPercent } from "@/lib/utils/format";
import { AssetRow } from "./asset-row";
import { AssetSearchBar } from "./asset-search-bar";
import { CatalogueSheet } from "./catalogue-sheet";
import { PeaVerdictBadge } from "./pea-badge";
import { peaVerdictFor, weightedTer } from "./types";
import type { StrategyForm } from "./use-strategy-form";

/**
 * Sélection des actifs : recherche, catalogue, lignes pondérées, totaux.
 *
 * Le même bloc sert dans la colonne étroite de l'espace de travail et dans la
 * colonne centrée de la création. Seule la densité change, pas la logique.
 */
export function AssetPicker({
  form,
  catalog,
  stacked = false,
}: {
  form: StrategyForm;
  catalog: CatalogAsset[];
  /** Recherche et catalogue l'un au-dessus de l'autre. Nécessaire dans la
   *  colonne de 330 px, où les mettre côte à côte laisse au champ de recherche
   *  moins de place qu'il n'en faut pour lire un nom d'ETF. */
  stacked?: boolean;
}) {
  const selectedIds = form.assets.map((a) => a.assetId);

  return (
    <div className="space-y-2">
      <div className={stacked ? "space-y-1.5" : "flex items-center gap-2"}>
        <div className="min-w-0 flex-1">
          <AssetSearchBar
            selectedIds={selectedIds}
            onAdd={form.addAsset}
            onAddFromYahoo={form.addFromYahoo}
          />
        </div>
        <div className={stacked ? "[&>button]:w-full" : undefined}>
          <CatalogueSheet
            catalog={catalog}
            selectedIds={selectedIds}
            onAdd={form.addAsset}
          />
        </div>
      </div>

      {form.assets.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed p-5 text-center">
          <Wallet className="size-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Cherchez par nom, ticker ou ISIN — « world », « cw8 » —, ou ouvrez
            « Parcourir » pour voir tout le catalogue.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {form.assets.map((asset) => (
              <AssetRow
                key={asset.assetId}
                asset={asset}
                color={form.palette.get(asset.assetId)!}
                stacked={stacked}
                onWeightChange={(weightPercent) =>
                  form.setWeight(asset.assetId, weightPercent)
                }
                onRemove={() => form.removeAsset(asset.assetId)}
              />
            ))}
          </div>

          {/* `flex-wrap` n'est pas décoratif : « Non éligible PEA » et le total
              additionnés dépassent la largeur d'une colonne latérale, et sans
              retour à la ligne le verdict sortirait du cadre. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-0.5">
            <dl className="flex items-center gap-3 text-[11px]">
              <div className="flex items-center gap-1">
                <dt className="text-muted-foreground">Total</dt>
                <dd
                  className={`tnum font-medium ${
                    form.weightsValid ? "" : "text-[var(--neg-text)]"
                  }`}
                >
                  {form.total.toLocaleString("fr-FR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  %
                </dd>
              </div>
              <div className="flex items-center gap-1">
                <dt className="text-muted-foreground">TER</dt>
                <dd className="tnum font-medium">
                  {formatPercent(weightedTer(form.assets))}
                </dd>
              </div>
            </dl>

            <div className="flex items-center gap-1.5">
              <PeaVerdictBadge verdict={peaVerdictFor(form.assets)} />
              {form.assets.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={form.equalize}
                >
                  <Scale className="size-3" />
                  Égaliser
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
