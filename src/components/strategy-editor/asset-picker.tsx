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
import type { PeaVerdict } from "./types";

/** Le verdict PEA en toutes lettres, pour la ligne de synthèse large. */
const PEA_VERDICT_TEXT: Record<PeaVerdict, string> = {
  eligible: "éligible PEA",
  ineligible: "compte-titres uniquement",
  unknown: "éligibilité PEA à vérifier",
};
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
  title,
}: {
  form: StrategyForm;
  catalog: CatalogAsset[];
  /** Recherche et catalogue l'un au-dessus de l'autre. Nécessaire dans la
   *  colonne de 330 px, où les mettre côte à côte laisse au champ de recherche
   *  moins de place qu'il n'en faut pour lire un nom d'ETF. */
  stacked?: boolean;
  /** Quand il est fourni, le titre partage sa ligne avec la recherche et le
   *  catalogue — la disposition large de l'écran de composition. */
  title?: string;
}) {
  const selectedIds = form.assets.map((a) => a.assetId);

  const controls = (
    <>
      <div className={title ? "min-w-0 max-w-sm flex-1" : "min-w-0 flex-1"}>
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
          triggerLabel={title ? "Parcourir le catalogue" : "Parcourir"}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-2">
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-base font-bold">{title}</h2>
          <div className="flex flex-1 items-center justify-end gap-2">
            {controls}
          </div>
        </div>
      ) : (
        <div className={stacked ? "space-y-1.5" : "flex items-center gap-2"}>
          {controls}
        </div>
      )}

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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`tnum rounded-full px-2.5 py-1 text-xs font-bold ${
                  form.weightsValid
                    ? "bg-[var(--pos)]/12 text-[var(--pos-text)]"
                    : "bg-[var(--neg)]/12 text-[var(--neg-text)]"
                }`}
              >
                Total{" "}
                {form.total.toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                })}{" "}
                %
              </span>
              {stacked ? (
                <PeaVerdictBadge verdict={peaVerdictFor(form.assets)} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {formatPercent(weightedTer(form.assets))} de frais par an ·{" "}
                  {PEA_VERDICT_TEXT[peaVerdictFor(form.assets)]}
                </span>
              )}
            </div>

            {form.assets.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                onClick={form.equalize}
              >
                <Scale className="size-3" />
                Égaliser{stacked ? "" : " les poids"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
