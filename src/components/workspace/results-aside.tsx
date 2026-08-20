"use client";

import { BreakdownDonut } from "@/components/charts/breakdown-donut";
import { MetricCard } from "@/components/results/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResultAssetInfo } from "@/lib/backtest/run-for-strategy";
import {
  collapseTail,
  geoBreakdown,
  sectorBreakdown,
} from "@/lib/backtest/breakdowns";
import { scoreAllMetrics } from "@/lib/engine/scoring";
import type { BacktestMetrics } from "@/lib/engine/types";

/**
 * Colonne de synthèse.
 *
 * Trois blocs seulement, et toujours les mêmes : la notation des ratios, puis
 * les deux décompositions du portefeuille. C'est la colonne qu'on regarde en
 * modifiant l'allocation à gauche — elle doit rester lisible d'un coup d'œil,
 * donc ne jamais accueillir les panneaux d'analyse détaillée du centre.
 */
export function ResultsAside({
  metrics,
  assets,
  realMode = false,
}: {
  metrics: BacktestMetrics;
  assets: ResultAssetInfo[];
  /** Les ratios portent alors sur le portefeuille déflaté. Le signaler dans le
   *  titre est indispensable : un Sharpe réel et un Sharpe nominal se
   *  ressemblent trop pour qu'on devine lequel on lit. */
  realMode?: boolean;
}) {
  const scores = scoreAllMetrics(metrics);

  // En dessous de 1280 px, ce bloc n'est plus une colonne mais une bande sous
  // le graphique : il s'étale alors en grille, et ne revient à la colonne
  // unique qu'une fois remonté à droite.
  return (
    <div className="space-y-5 p-4 lg:px-5 xl:px-4">
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ratios{realMode && " · euros constants"}
        </h2>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-1">
          {scores.map((score) => (
            <MetricCard key={score.key} score={score} compact />
          ))}
        </div>
      </section>

      <section className="grid gap-6 border-t pt-4 sm:grid-cols-2 xl:grid-cols-1 xl:gap-5">
        <BreakdownDonut
          title="Par zone géographique"
          slices={collapseTail(geoBreakdown(assets))}
          emptyLabel="Aucune décomposition géographique disponible pour ces actifs."
        />
        <BreakdownDonut
          title="Par secteur"
          slices={collapseTail(sectorBreakdown(assets))}
          emptyLabel="Aucune décomposition sectorielle disponible pour ces actifs."
        />
      </section>
    </div>
  );
}

export function ResultsAsideSkeleton() {
  return (
    <div className="grid gap-1.5 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-5 xl:grid-cols-1 xl:px-4">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className="h-[74px]" />
      ))}
    </div>
  );
}
