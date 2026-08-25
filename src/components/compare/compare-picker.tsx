"use client";

import { Check, Wallet, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { addFallbackAsset } from "@/actions/assets";
import { AssetSearchBar } from "@/components/strategy-editor/asset-search-bar";
import { CatalogueSheet } from "@/components/strategy-editor/catalogue-sheet";
import { PeaBadge } from "@/components/strategy-editor/pea-badge";
import type { EditorAsset } from "@/components/strategy-editor/types";
import { HoldingsBar } from "@/components/strategy-list/holdings-bar";
import { Button } from "@/components/ui/button";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import type { StrategyListItem } from "@/lib/db/queries/strategies";
import { cn } from "@/lib/utils";
import { formatPercent, formatRatio } from "@/lib/utils/format";

/** Bornes imposées par la lisibilité du tableau et des courbes superposées. */
export const MIN_ITEMS = 2;
export const MAX_ITEMS = 4;

export interface CompareSelection {
  strategyIds: string[];
  assetIds: string[];
}

export function selectionSize(selection: CompareSelection): number {
  return selection.strategyIds.length + selection.assetIds.length;
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Ce qu'il faut d'un support pour l'afficher une fois retenu. */
interface KnownAsset {
  id: string;
  label: string;
  ticker: string;
  ter: number | null;
  peaEligible: boolean | null;
}

function fromCatalog(asset: CatalogAsset): KnownAsset {
  return {
    id: asset.id,
    label: asset.shortLabel,
    ticker: asset.tickerYahoo,
    ter: asset.ter === null ? null : Number(asset.ter),
    peaEligible: asset.peaEligible,
  };
}

/**
 * Choix de ce qu'on compare.
 *
 * Stratégies et supports dans la même colonne, parce que la question qu'on se
 * pose est presque toujours mixte : « est-ce que mon allocation bat un simple
 * MSCI World ? ». Obliger à créer une stratégie « 100 % World » pour y répondre
 * serait une corvée, et remplirait la liste de stratégies fantoches.
 *
 * Deux gestes différents pour deux natures différentes :
 *
 * - **les stratégies** se cochent dans une liste, parce qu'elles sont peu
 *   nombreuses, qu'elles n'ont pas de nom canonique à taper et qu'on les
 *   reconnaît à leur composition, montrée sur chaque ligne ;
 * - **les supports** se cherchent ou se parcourent, exactement comme dans
 *   l'éditeur de stratégie : dérouler trente-deux lignes de catalogue dans la
 *   colonne noyait les stratégies tout en haut, et n'offrait ni la recherche par
 *   ISIN ni le regroupement par indice répliqué.
 *
 * Un support est calculé comme une stratégie à une seule ligne, avec le plan
 * d'investissement de la comparaison : on compare bien des allocations, et non
 * les plans d'épargne enregistrés sur chacune.
 */
export function ComparePicker({
  strategies,
  catalog,
  chosenAssets,
  selection,
  onChange,
}: {
  strategies: StrategyListItem[];
  catalog: CatalogAsset[];
  /** Supports déjà retenus, résolus côté serveur : un actif ajouté depuis Yahoo
   *  n'est pas au catalogue et s'afficherait sinon sans nom au retour sur la
   *  page. */
  chosenAssets: CatalogAsset[];
  selection: CompareSelection;
  onChange: (selection: CompareSelection) => void;
}) {
  // Registre des supports connus, alimenté au fil des ajouts : le catalogue ne
  // contient pas ceux venus de Yahoo, et une ligne retenue doit garder son nom.
  const [known, setKnown] = useState<Record<string, KnownAsset>>(() => {
    const map: Record<string, KnownAsset> = {};
    for (const asset of [...catalog, ...chosenAssets]) {
      map[asset.id] = fromCatalog(asset);
    }
    return map;
  });

  const count = selectionSize(selection);
  const full = count >= MAX_ITEMS;
  const capacityNote = full
    ? `Maximum atteint : ${MAX_ITEMS} éléments comparés. Retirez-en un pour en ajouter un autre.`
    : null;

  function addAsset(asset: EditorAsset) {
    if (full || selection.assetIds.includes(asset.assetId)) return;

    setKnown((current) => ({
      ...current,
      [asset.assetId]: {
        id: asset.assetId,
        label: asset.shortLabel,
        ticker: asset.tickerYahoo,
        ter: asset.ter,
        peaEligible: asset.peaEligible,
      },
    }));

    onChange({ ...selection, assetIds: [...selection.assetIds, asset.assetId] });
  }

  async function addFromYahoo(symbol: string, name: string) {
    const result = await addFallbackAsset({ symbol, name });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    addAsset({
      assetId: result.data.assetId,
      tickerYahoo: symbol,
      shortLabel: name.length > 40 ? `${name.slice(0, 38)}…` : name,
      name,
      type: "stock",
      peaEligible: null,
      ter: null,
      currency: "EUR",
      dataPartial: true,
      weightPercent: 0,
    });
  }

  return (
    <div className="space-y-5">
      {strategies.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mes stratégies
          </h2>
          <ul className="space-y-1.5">
            {strategies.map((strategy) => (
              <li key={strategy.id}>
                <StrategyRow
                  selected={selection.strategyIds.includes(strategy.id)}
                  full={full}
                  title={strategy.name}
                  subtitle={
                    strategy.metrics
                      ? `${formatPercent(strategy.metrics.cagr)} par an · Sharpe ${formatRatio(strategy.metrics.sharpe)}`
                      : "jamais lancée"
                  }
                  // La composition est ce qui distingue vraiment deux
                  // stratégies au moment de choisir laquelle confronter.
                  detail={<HoldingsBar holdings={strategy.holdings} maxRows={3} />}
                  onToggle={() =>
                    onChange({
                      ...selection,
                      strategyIds: toggleIn(selection.strategyIds, strategy.id),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Supports
        </h2>

        {/* Recherche au-dessus, catalogue en dessous : côte à côte dans une
            colonne de 360 px, le champ n'a plus la place d'afficher un nom
            d'ETF. Le catalogue, lui, s'ouvre en panneau latéral. */}
        <div className="space-y-1.5">
          <AssetSearchBar
            selectedIds={selection.assetIds}
            onAdd={addAsset}
            onAddFromYahoo={addFromYahoo}
            disabled={full}
          />
          <div className="[&>button]:w-full">
            <CatalogueSheet
              catalog={catalog}
              selectedIds={selection.assetIds}
              onAdd={addAsset}
              disabledReason={capacityNote}
            />
          </div>
        </div>

        {selection.assetIds.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed p-4 text-center">
            <Wallet className="size-4 text-muted-foreground" />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Cherchez par nom, ticker ou ISIN — « world », « cw8 » —, ou ouvrez
              « Parcourir » pour confronter une stratégie à un support isolé.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {selection.assetIds.map((id) => {
              const asset = known[id];

              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-primary bg-white px-3 py-2 dark:bg-input/20"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {asset?.label ?? "Support retiré du catalogue"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {asset
                        ? `${asset.ticker}${
                            asset.ter === null
                              ? ""
                              : ` · ${formatPercent(asset.ter)} de frais`
                          }`
                        : "Retirez-le de la comparaison"}
                    </span>
                  </span>

                  {asset && <PeaBadge eligible={asset.peaEligible} />}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    onClick={() =>
                      onChange({
                        ...selection,
                        assetIds: selection.assetIds.filter((x) => x !== id),
                      })
                    }
                  >
                    <X className="size-3.5" />
                    <span className="sr-only">
                      Retirer {asset?.label ?? "ce support"}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StrategyRow({
  selected,
  full,
  title,
  subtitle,
  detail,
  onToggle,
}: {
  selected: boolean;
  full: boolean;
  title: string;
  subtitle: string;
  /** Bloc affiché sous le libellé, sur toute la largeur de la ligne. */
  detail?: React.ReactNode;
  onToggle: () => void;
}) {
  const disabled = full && !selected;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "block w-full rounded-lg border px-3 py-2 text-left transition-colors",
        selected
          ? "border-primary bg-white dark:bg-input/20"
          : "bg-white hover:border-foreground/20 dark:bg-input/10",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      <span className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded border",
            selected && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {selected && <Check className="size-2.5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </span>

      {detail && <span className="mt-1.5 block pl-7">{detail}</span>}
    </button>
  );
}
