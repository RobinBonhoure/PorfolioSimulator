"use client";

import { Check, Info } from "lucide-react";

import { PeaBadge } from "@/components/strategy-editor/pea-badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils/format";

/**
 * Choix du support, à indice constant.
 *
 * C'est le seul arbitrage vraiment à la main de l'investisseur une fois
 * l'allocation décidée : trois ETF peuvent répliquer le même indice et facturer
 * du simple au double. Sur trente ans, dix points de base d'écart de frais
 * représentent plusieurs milliers d'euros — mais encore faut-il voir les trois
 * côte à côte, ce que ne permet aucun comparateur d'émetteur.
 *
 * Les lignes sont classées par frais croissants. Ce n'est pas neutre et c'est
 * assumé : à indice identique, les frais sont le seul écart dont on sache
 * qu'il persistera.
 */
export function StepRefine({
  holdings,
  catalog,
  substitutions,
  onSubstitute,
}: {
  holdings: { ticker: string; weightPercent: number }[];
  catalog: CatalogAsset[];
  /** Ticker d'origine → ticker retenu. */
  substitutions: Record<string, string>;
  onSubstitute: (originalTicker: string, chosenTicker: string) => void;
}) {
  const byTicker = new Map(catalog.map((asset) => [asset.tickerYahoo, asset]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pour chaque ligne, les supports du catalogue qui suivent le même indice.
        À indice identique, la performance ne diffère que par les frais et la
        qualité de réplication : c&apos;est le seul arbitrage qui vous revienne
        vraiment. Le support présélectionné est modifiable.
      </p>

      {holdings.map((holding) => {
        const original = byTicker.get(holding.ticker);
        if (!original) return null;

        const chosen = substitutions[holding.ticker] ?? holding.ticker;
        const alternatives = original.trackedIndex
          ? catalog
              .filter((asset) => asset.trackedIndex === original.trackedIndex)
              .sort((a, b) => Number(a.ter ?? 1) - Number(b.ter ?? 1))
          : [original];

        // Plusieurs supports peuvent partager le même TER minimal. Signaler le
        // premier d'entre eux laisserait croire à un classement qui n'existe
        // pas, et contredirait la coche posée sur un autre support pourtant
        // aussi bon marché : on marque donc tous les ex æquo.
        const cheapestTer = Math.min(
          ...alternatives.map((asset) => Number(asset.ter ?? 1)),
        );

        return (
          <section key={holding.ticker} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">
                {original.trackedIndex ?? original.shortLabel}
              </h3>
              <span className="tnum text-xs text-muted-foreground">
                {holding.weightPercent} % du portefeuille
              </span>
            </div>

            {alternatives.length === 1 ? (
              <SupportRow
                asset={alternatives[0]}
                selected
                unique
                onSelect={() => undefined}
              />
            ) : (
              <div className="grid gap-1.5">
                {alternatives.map((asset) => (
                  <SupportRow
                    key={asset.id}
                    asset={asset}
                    selected={asset.tickerYahoo === chosen}
                    cheapest={Number(asset.ter ?? 1) === cheapestTer}
                    onSelect={() => onSubstitute(holding.ticker, asset.tickerYahoo)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SupportRow({
  asset,
  selected,
  cheapest,
  unique,
  onSelect,
}: {
  asset: CatalogAsset;
  selected: boolean;
  cheapest?: boolean;
  unique?: boolean;
  onSelect: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {selected && <Check className="size-2.5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{asset.shortLabel}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {issuerOf(asset.name)}
        </span>
      </span>

      <PeaBadge eligible={asset.peaEligible} />

      <span className="tnum w-16 shrink-0 text-right text-xs">
        {asset.ter === null ? "—" : formatPercent(Number(asset.ter))}
        {cheapest && !unique && (
          <span className="block text-[10px] text-[var(--pos-text)]">
            frais les plus bas
          </span>
        )}
      </span>

      <span className="tnum hidden w-24 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
        {asset.avgVolume === null
          ? "liquidité n. c."
          : `${asset.avgVolume.toLocaleString("fr-FR")} /j`}
      </span>
    </>
  );

  if (unique) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-secondary/30 px-2.5 py-2">
        {body}
        <HoverCard>
          <HoverCardTrigger asChild>
            <span className="cursor-help text-muted-foreground">
              <Info className="size-3.5" />
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-72 text-xs">
            Aucun autre support du catalogue ne suit cet indice : il n&apos;y a
            rien à arbitrer ici.
          </HoverCardContent>
        </HoverCard>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "hover:border-foreground/20 hover:bg-secondary/40",
      )}
    >
      {body}
    </button>
  );
}

/**
 * Émetteur déduit du nom complet.
 *
 * Il n'existe pas de colonne dédiée, et le nom commercial commence par la
 * marque dans la quasi-totalité des cas : « Amundi MSCI World… », « iShares
 * Core… ». On prend les deux premiers mots plutôt que le nom entier, qui
 * déborderait de la ligne sans rien apprendre de plus.
 */
function issuerOf(name: string): string {
  return name.split(" ").slice(0, 2).join(" ");
}
