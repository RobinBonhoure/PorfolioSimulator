"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { CorrelationHeatmap } from "@/components/charts/correlation-heatmap";
import { MainChart, type MainChartMode } from "@/components/charts/main-chart";
import { RollingReturnsChart } from "@/components/charts/rolling-returns-chart";
import { FeeBreakdown } from "@/components/results/fee-breakdown";
import { ValueCard } from "@/components/results/metric-card";
import { ProjectionPanel } from "@/components/results/projection-panel";
import { TaxationPanel } from "@/components/results/taxation-panel";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StrategyBacktestResponse } from "@/lib/backtest/run-for-strategy";
import {
  formatDate,
  formatDuration,
  formatEur,
  formatPercent,
  formatSignedPercent,
} from "@/lib/utils/format";

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

/**
 * Colonne centrale : ce que la stratégie a produit.
 *
 * Les ratios notés et les répartitions n'y figurent pas — ils vivent dans la
 * colonne de droite, en vis-à-vis permanent des paramètres de gauche. Le centre
 * garde la chronologie : le bandeau de valeurs, la courbe, puis les analyses
 * détaillées qu'on ne consulte qu'en s'y arrêtant.
 */
export function ResultsCenter({ data }: { data: StrategyBacktestResponse }) {
  const [mode, setMode] = useState<MainChartMode>("value");
  const [logScale, setLogScale] = useState(false);

  const { result, assets, benchmarkLabel, warnings } = data;
  const { metrics } = result;

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <header>
        <p className="text-sm text-muted-foreground">
          Du {formatDate(metrics.startDate)} au {formatDate(metrics.endDate)} ·{" "}
          {metrics.effectiveYears.toFixed(1).replace(".", ",")} ans ·{" "}
          {assets.length} actif{assets.length > 1 ? "s" : ""}
          {result.usedProxyData && " · historique complété par proxy"}
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="space-y-1 rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm">
          {warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--score-3)]" />
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-4 2xl:grid-cols-2">
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
              { label: "Meilleur mois", period: metrics.bestMonth },
              { label: "Pire mois", period: metrics.worstMonth },
              { label: "Meilleure année", period: metrics.bestYear },
              { label: "Pire année", period: metrics.worstYear },
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
          title="Projection"
          description="Ce que cette allocation pourrait devenir — un éventail de scénarios, pas une prévision."
        >
          <ProjectionPanel
            metrics={metrics}
            monthlyReturns={result.analytics.monthlyPortfolioReturns}
            defaultInitialAmount={data.params.initialAmount}
            defaultMonthlyContribution={data.params.monthlyContribution}
          />
        </Section>

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
      </div>
    </div>
  );
}

export function ResultsCenterSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:p-5">
      <Skeleton className="h-5 w-72" />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px]" />
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
