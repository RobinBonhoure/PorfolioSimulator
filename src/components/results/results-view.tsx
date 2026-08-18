"use client";

import {
  Copy,
  Loader2,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { duplicateStrategy } from "@/actions/strategies";
import { BreakdownDonut } from "@/components/charts/breakdown-donut";
import { CorrelationHeatmap } from "@/components/charts/correlation-heatmap";
import { MainChart, type MainChartMode } from "@/components/charts/main-chart";
import { RollingReturnsChart } from "@/components/charts/rolling-returns-chart";
import {
  collapseTail,
  geoBreakdown,
  sectorBreakdown,
} from "@/lib/backtest/breakdowns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBacktest } from "@/hooks/use-backtest";
import { scoreAllMetrics } from "@/lib/engine/scoring";
import type { YoungAssetResolution } from "@/lib/engine/types";
import {
  formatDate,
  formatDuration,
  formatEur,
  formatPercent,
  formatSignedPercent,
} from "@/lib/utils/format";
import { FeeBreakdown } from "./fee-breakdown";
import { MetricCard, ValueCard } from "./metric-card";
import { TaxationPanel } from "./taxation-panel";
import { YoungAssetDialog } from "./young-asset-dialog";

const MODE_LABELS: Record<MainChartMode, string> = {
  value: "Valeur",
  contribution: "Par actif",
  weights: "Poids",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function ResultsView({ strategyId }: { strategyId: string }) {
  const router = useRouter();
  const [duplicating, startDuplicate] = useTransition();

  const [resolution, setResolution] = useState<YoungAssetResolution | null>(null);
  const [mode, setMode] = useState<MainChartMode>("value");
  const [logScale, setLogScale] = useState(false);

  const { data, isPending, error } = useBacktest(strategyId, resolution);

  if (isPending) return <ResultsSkeleton />;

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <TriangleAlert className="size-5 text-[var(--neg-text)]" />
        <p className="font-medium">Le backtest n&apos;a pas abouti</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={`/strategies/${strategyId}/edit`}>Modifier la stratégie</a>
        </Button>
      </div>
    );
  }

  const { result, assets, benchmarkLabel, strategyName, warnings } = data;
  const { metrics } = result;
  const scores = scoreAllMetrics(metrics);

  // L'arbitrage n'est demandé qu'une fois : une fois choisi, il est passé à
  // chaque recalcul via la clé de requête.
  const needsResolution = resolution === null && result.youngAssets.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <YoungAssetDialog
        open={needsResolution}
        youngAssets={result.youngAssets}
        requestedYears={Math.round(metrics.effectiveYears)}
        effectiveStartDate={metrics.startDate}
        onResolve={setResolution}
      />

      <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
        {/* En-tête */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {strategyName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Du {formatDate(metrics.startDate)} au {formatDate(metrics.endDate)}{" "}
              · {metrics.effectiveYears.toFixed(1).replace(".", ",")} ans ·{" "}
              {assets.length} actif{assets.length > 1 ? "s" : ""}
              {result.usedProxyData && " · historique complété par proxy"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/strategies/${strategyId}/edit`}>
                <Pencil className="size-3.5" />
                Modifier
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={duplicating}
              onClick={() =>
                startDuplicate(async () => {
                  const copy = await duplicateStrategy(strategyId);
                  if (!copy.ok) {
                    toast.error(copy.error);
                    return;
                  }
                  router.push(`/strategies/${copy.data.id}/edit`);
                })
              }
            >
              {duplicating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Dupliquer
            </Button>
          </div>
        </header>

        {warnings.length > 0 && (
          <div className="rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm">
            {warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--score-3)]" />
                {warning}
              </p>
            ))}
          </div>
        )}

        {/* Bandeau de valeurs */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ValueCard
            label="Valeur finale"
            value={formatEur(metrics.finalValue)}
            hint={
              metrics.real
                ? `${formatEur(metrics.real.finalValue)} en euros constants`
                : undefined
            }
          />
          <ValueCard
            label="Capital investi"
            value={formatEur(metrics.totalInvested)}
            hint={`Dont ${formatEur(metrics.initialValue)} au départ`}
          />
          <ValueCard
            label="Gain"
            value={formatEur(metrics.totalGain)}
            tone={metrics.totalGain >= 0 ? "positive" : "negative"}
            hint={formatSignedPercent(metrics.totalReturn)}
          />
          <ValueCard
            label="Frais prélevés"
            value={formatEur(metrics.fees.total)}
            tone="negative"
            hint={`${formatEur(metrics.feeImpact)} de manque à gagner`}
          />
        </div>

        {/* Bandeau de métriques notées */}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {scores.map((score) => (
            <MetricCard key={score.key} score={score} compact />
          ))}
        </div>

        {/* Graphique principal */}
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as MainChartMode)}
            >
              <TabsList>
                {(Object.keys(MODE_LABELS) as MainChartMode[]).map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {MODE_LABELS[key]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {mode === "value" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="log-scale" className="text-xs font-normal">
                  Échelle logarithmique
                </Label>
                <Switch
                  id="log-scale"
                  checked={logScale}
                  onCheckedChange={setLogScale}
                />
              </div>
            )}
          </div>

          <div className="h-[340px]">
            <MainChart
              mode={mode}
              series={result.series}
              assets={assets}
              benchmarkLabel={benchmarkLabel}
              logScale={logScale}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {mode === "value" &&
              "Valeur du portefeuille, capital cumulé investi et référence, en euros."}
            {mode === "contribution" &&
              "Valeur de chaque ligne, empilée : la hauteur totale est la valeur du portefeuille."}
            {mode === "weights" &&
              "Poids de chaque ligne dans le portefeuille. La dérive entre deux rééquilibrages s'y lit directement."}
          </p>
        </section>

        {/* Détail */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Baisse maximale"
            description="La pire séquence traversée, et le temps qu'il a fallu pour l'effacer."
          >
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Amplitude</dt>
                <dd className="tnum font-medium text-[var(--neg-text)]">
                  {formatPercent(metrics.drawdown.maxDrawdown)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Du sommet</dt>
                <dd className="tnum">{formatDate(metrics.drawdown.peakDate)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Au creux</dt>
                <dd className="tnum">{formatDate(metrics.drawdown.troughDate)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Retour au sommet</dt>
                <dd className="tnum">
                  {metrics.drawdown.recoveryDate
                    ? `${formatDate(metrics.drawdown.recoveryDate)} · ${formatDuration(metrics.drawdown.recoveryDays)}`
                    : "Jamais sur la période"}
                </dd>
              </div>
            </dl>
          </Section>

          <Section
            title="Extrêmes"
            description="Les périodes les plus favorables et les plus défavorables."
          >
            <dl className="space-y-2 text-sm">
              {[
                { label: "Meilleur mois", period: metrics.bestMonth, positive: true },
                { label: "Pire mois", period: metrics.worstMonth, positive: false },
                { label: "Meilleure année", period: metrics.bestYear, positive: true },
                { label: "Pire année", period: metrics.worstYear, positive: false },
              ].map(({ label, period }) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">
                    {label}
                    {period ? ` · ${period.period}` : ""}
                  </dt>
                  <dd
                    className={`tnum font-medium ${
                      period && period.return >= 0
                        ? "text-[var(--pos-text)]"
                        : "text-[var(--neg-text)]"
                    }`}
                  >
                    {period ? formatSignedPercent(period.return) : "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section
            title="Frais"
            description="Ce que la stratégie a coûté, et ce que ce coût a empêché de gagner."
          >
            <FeeBreakdown metrics={metrics} />
          </Section>

          {metrics.taxation && (
            <Section
              title="Fiscalité à la sortie"
              description="Valeur nette selon l'enveloppe, en cas de retrait total au terme."
            >
              <TaxationPanel
                taxation={metrics.taxation}
                years={metrics.effectiveYears}
              />
            </Section>
          )}

          <Section
            title="Rendements dans le temps"
            description="Ce qu'a rapporté chaque année, et ce qu'aurait obtenu une entrée à n'importe quelle date."
          >
            <RollingReturnsChart
              annualReturns={result.analytics.annualReturns}
              rollingReturns={result.analytics.rollingReturns}
            />
          </Section>

          {result.analytics.correlation && (
            <Section
              title="Corrélation entre actifs"
              description="Sur les rendements mensuels. Plus les couples sont clairs, plus la diversification est réelle."
            >
              <CorrelationHeatmap correlation={result.analytics.correlation} />
            </Section>
          )}

          <Section
            title="Répartitions du portefeuille"
            description="Décompositions des supports, pondérées par leurs poids cibles."
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <BreakdownDonut
                title="Par secteur"
                slices={collapseTail(sectorBreakdown(assets))}
                emptyLabel="Aucune décomposition sectorielle disponible pour ces actifs."
              />
              <BreakdownDonut
                title="Par zone géographique"
                slices={collapseTail(geoBreakdown(assets))}
                emptyLabel="Aucune décomposition géographique disponible pour ces actifs."
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-[82px]" />
        ))}
      </div>
      <Skeleton className="h-[420px]" />
      <p className="text-center text-sm text-muted-foreground">
        Récupération des cours et calcul en cours. Le premier backtest d&apos;une
        stratégie télécharge l&apos;historique complet de ses actifs ; les
        suivants sont immédiats.
      </p>
    </div>
  );
}
