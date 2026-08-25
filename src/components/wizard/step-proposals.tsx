"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useBacktestPreviews } from "@/hooks/use-backtest-preview";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { cn } from "@/lib/utils";
import { buildAssetPalette } from "@/lib/utils/asset-palette";
import { formatDate, formatEur, formatPercent } from "@/lib/utils/format";
import type { RecommendedStrategy } from "@/lib/wizard/recommend";
import type { StrategyParams } from "@/lib/engine/types";

/**
 * Les trois propositions, chiffrées sur données réelles.
 *
 * Chacune est réellement backtestée : sans cela, l'écran demanderait de choisir
 * entre trois noms et trois pourcentages, ce qui ne renseigne sur rien. La
 * baisse maximale est mise en avant autant que la performance — c'est elle qui
 * décide si l'allocation est tenable, et le questionnaire vient précisément
 * d'interroger l'utilisateur sur sa réaction à une chute de 30 %.
 */
export function StepProposals({
  strategies,
  params,
  catalog,
  selectedId,
  onSelect,
}: {
  strategies: RecommendedStrategy[];
  params: StrategyParams;
  catalog: CatalogAsset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const byTicker = new Map(catalog.map((asset) => [asset.tickerYahoo, asset]));

  const requests = strategies.map((strategy) => ({
    key: `${strategy.id}:${params.years}:${params.initialAmount}:${params.monthlyContribution}:${strategy.holdings
      .map((h) => `${h.ticker}@${h.weightPercent}`)
      .join(",")}`,
    params,
    selection: strategy.holdings
      .map((holding) => ({
        assetId: byTicker.get(holding.ticker)?.id ?? "",
        targetWeight: holding.weightPercent / 100,
      }))
      .filter((entry) => entry.assetId !== ""),
  }));

  const previews = useBacktestPreviews(requests);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {strategies.length === 1
          ? "Votre horizon ne laisse qu'une réponse raisonnable."
          : `${strategies.length} allocations encadrant vos réponses, backtestées sur données réelles. Aucune n'est « la bonne » : le choix entre elles est celui du niveau de baisse que vous acceptez de traverser.`}
      </p>

      {/* Classes littérales : Tailwind analyse le source statiquement, une
          classe construite par concaténation ne serait jamais générée. */}
      <div
        className={cn(
          "grid gap-3",
          strategies.length === 2 && "lg:grid-cols-2",
          strategies.length >= 3 && "lg:grid-cols-3",
        )}
      >
        {strategies.map((strategy, index) => {
          const preview = previews[index];
          const metrics = preview?.data?.result.metrics;
          const selected = selectedId === strategy.id;

          return (
            <button
              key={strategy.id}
              type="button"
              onClick={() => onSelect(strategy.id)}
              aria-pressed={selected}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border p-4 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "hover:border-foreground/20 hover:bg-secondary/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{strategy.name}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {strategy.equityShare} % d&apos;actions ·{" "}
                    {100 - strategy.equityShare} % de taux
                  </p>
                </div>
                {selected && (
                  <span className="rounded-full bg-primary p-1 text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </div>

              {preview?.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ) : preview?.error ? (
                <p className="flex items-start gap-1.5 text-xs text-[var(--neg-text)]">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                  {preview.error.message}
                </p>
              ) : metrics ? (
                <dl className="grid grid-cols-2 gap-2 rounded-md bg-secondary/40 p-2.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Rendement annualisé</dt>
                    <dd className="tnum text-sm font-semibold text-[var(--pos-text)]">
                      {formatPercent(metrics.cagr)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pire baisse</dt>
                    <dd className="tnum text-sm font-semibold text-[var(--neg-text)]">
                      {formatPercent(metrics.drawdown.maxDrawdown)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Volatilité</dt>
                    <dd className="tnum">{formatPercent(metrics.volatility)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Valeur finale</dt>
                    <dd className="tnum">{formatEur(metrics.finalValue)}</dd>
                  </div>
                  {/* La période n'est pas un détail : les mêmes chiffres sur
                      deux ans ou sur dix-sept ne veulent pas dire la même
                      chose, et rien à l'écran ne le dirait autrement. */}
                  <div className="col-span-2 border-t pt-1.5">
                    <dt className="sr-only">Période mesurée</dt>
                    <dd className="text-[11px] text-muted-foreground">
                      Mesuré sur{" "}
                      <span className="tnum">
                        {metrics.effectiveYears.toFixed(1).replace(".", ",")} ans
                      </span>
                      , de {formatDate(metrics.startDate)} à{" "}
                      {formatDate(metrics.endDate)}
                      {preview?.data?.result.usedProxyData &&
                        " · historique complété par un indice de substitution"}
                    </dd>
                  </div>
                </dl>
              ) : null}

              <AllocationBars strategy={strategy} catalog={catalog} />

              <p className="text-xs leading-relaxed text-muted-foreground">
                {strategy.rationale}
              </p>
            </button>
          );
        })}
      </div>

      {previews.some((p) => p.isPending) && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Récupération des cours et calcul en cours.
        </p>
      )}

      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Ces allocations sont des points de départ construits à partir de vos
        réponses, pas un conseil personnalisé. Les performances passées ne
        préjugent pas des performances futures.
      </p>
    </div>
  );
}

/** Barre de composition : une bande par ligne, à sa couleur d'actif. */
function AllocationBars({
  strategy,
  catalog,
}: {
  strategy: RecommendedStrategy;
  catalog: CatalogAsset[];
}) {
  const byTicker = new Map(catalog.map((asset) => [asset.tickerYahoo, asset]));
  const ids = strategy.holdings.map((h) => byTicker.get(h.ticker)?.id ?? h.ticker);
  const palette = buildAssetPalette(ids);

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full">
        {strategy.holdings.map((holding, index) => (
          <span
            key={holding.ticker}
            style={{
              width: `${holding.weightPercent}%`,
              backgroundColor: palette.get(ids[index]),
            }}
            // Un filet de fond entre les segments : sans lui, deux teintes
            // voisines se lisent comme une seule bande.
            className="border-r border-card last:border-r-0"
          />
        ))}
      </div>
      <ul className="space-y-0.5 text-[11px]">
        {strategy.holdings.map((holding, index) => (
          <li key={holding.ticker} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-sm"
              style={{ backgroundColor: palette.get(ids[index]) }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {byTicker.get(holding.ticker)?.shortLabel ?? holding.ticker}
            </span>
            <span className="tnum">{holding.weightPercent} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
