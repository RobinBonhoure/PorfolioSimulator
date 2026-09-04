"use client";

import { TrendingUp, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { CorrelationHeatmap } from "@/components/charts/correlation-heatmap";
import { MainChart, type MainChartMode } from "@/components/charts/main-chart";
import { RollingReturnsChart } from "@/components/charts/rolling-returns-chart";
import { BreakdownDonut } from "@/components/charts/breakdown-donut";
import { ExpertDetails } from "@/components/common/expert-details";
import { AssetBreakdown } from "@/components/results/asset-breakdown";
import { FeeBreakdown } from "@/components/results/fee-breakdown";
import { MetricCard } from "@/components/results/metric-card";
import { ProjectionPanel } from "@/components/results/projection-panel";
import { TaxationPanel } from "@/components/results/taxation-panel";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  capBreakdown,
  collapseTail,
  equityShareOf,
  geoBreakdown,
  sectorBreakdown,
} from "@/lib/backtest/breakdowns";
import {
  displayedMetrics,
  isRealMode,
} from "@/lib/backtest/displayed-metrics";
import type { StrategyBacktestResponse } from "@/lib/backtest/run-for-strategy";
import { RobustnessPanel } from "@/components/diversification/robustness-panel";
import { analyseBacktestedStrategy } from "@/lib/diversification/from-backtest";
import type { CorrelationMatrix } from "@/lib/engine/analytics";
import { scoreAllMetrics } from "@/lib/engine/scoring";
import {
  formatDate,
  formatDuration,
  formatEur,
  formatPercent,
  formatRatio,
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
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-heading text-base font-bold">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Carte de chiffre en langage courant : un libellé, une valeur, un repère. */
function PlainStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-5">
      <span className="text-[13px] font-bold text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-heading tnum text-2xl font-bold ${
          tone === "positive"
            ? "text-[var(--pos-text)]"
            : tone === "negative"
              ? "text-[var(--neg-text)]"
              : ""
        }`}
      >
        {value}
      </span>
      <span className="text-[13px] text-muted-foreground">{hint}</span>
    </div>
  );
}

/**
 * La corrélation, dite en français avant d'être montrée en matrice.
 *
 * La heatmap est un outil de connaisseur ; la phrase porte l'information que la
 * plupart des lecteurs viennent chercher — mes lignes se diversifient-elles
 * vraiment ? Pour deux actifs, la matrice entière se réduit d'ailleurs à ce
 * seul nombre.
 */
function correlationSummary(correlation: CorrelationMatrix): string | null {
  const { labels, matrix } = correlation;
  if (labels.length < 2) return null;

  let high = { i: 0, j: 1, value: -2 };
  let low = { i: 0, j: 1, value: 2 };
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const value = matrix[i][j];
      if (value > high.value) high = { i, j, value };
      if (value < low.value) low = { i, j, value };
    }
  }

  const reading = (value: number) =>
    value >= 0.8
      ? "évoluent presque ensemble : ils se diversifient peu entre eux"
      : value >= 0.5
        ? "évoluent souvent dans le même sens"
        : value >= 0
          ? "évoluent assez indépendamment : la diversification joue"
          : "évoluent souvent en sens opposés : l'un amortit l'autre";

  const pair = (i: number, j: number, value: number) =>
    `${labels[i]} et ${labels[j]} ${reading(value)} (corrélation ${formatRatio(value)})`;

  if (labels.length === 2) return `${pair(0, 1, matrix[0][1])}.`;

  return `Le couple le plus lié : ${pair(high.i, high.j, high.value)}. Le plus indépendant : ${pair(low.i, low.j, low.value)}.`;
}

/**
 * Colonne centrale, en deux étages.
 *
 * L'essentiel d'abord — combien ça vaut, la courbe, trois chiffres en langage
 * courant, puis la projection, qui parle à tout le monde. Les analyses de
 * connaisseur (ratios notés, détail par support, corrélations, répartitions)
 * vivent sous un trait « Détails d'expert » repliable : rien n'est supprimé,
 * tout est hiérarchisé. Le repli est mémorisé — un habitué des ratios ne doit
 * pas rouvrir la section à chaque visite.
 */
export function ResultsCenter({ data }: { data: StrategyBacktestResponse }) {
  const [mode, setMode] = useState<MainChartMode>("value");
  const [logScale, setLogScale] = useState(false);
  const { result, assets, benchmarkLabel, warnings } = data;

  // Le jeu de métriques affiché bascule intégralement en euros constants quand
  // le rendement réel est demandé : ratios, extrêmes, baisse maximale et
  // courbes. Un seul chiffre déflaté au milieu de chiffres nominaux serait
  // illisible, et surtout trompeur.
  const realMode = isRealMode(data.params.realReturns, result.metrics);
  const metrics = displayedMetrics(result.metrics, realMode);
  const scores = scoreAllMetrics(metrics);

  const gainPositive = metrics.totalGain >= 0;
  /** Chiffre de tête : ce que l'argent a rapporté, pas ce que l'allocation a
   *  produit période par période. */
  const headlineReturn = metrics.moneyWeightedReturn;
  const correlationText = result.analytics.correlation
    ? correlationSummary(result.analytics.correlation)
    : null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 lg:px-2 lg:py-1">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-sm text-muted-foreground">
          Du {formatDate(metrics.startDate)} au {formatDate(metrics.endDate)} ·{" "}
          {metrics.effectiveYears.toFixed(1).replace(".", ",")} ans ·{" "}
          {assets.length} actif{assets.length > 1 ? "s" : ""}
          {result.usedProxyData && " · historique complété par proxy"}
        </p>
        {realMode && (
          <span className="rounded-full border border-[var(--series-2)]/40 bg-[var(--series-2)]/10 px-2 py-0.5 text-[11px] text-[var(--series-2)]">
            Euros constants · inflation{" "}
            {formatPercent(result.metrics.real!.annualInflation)} par an
          </span>
        )}
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

      {/* --- L'essentiel ---------------------------------------------------- */}

      <section className="space-y-4 rounded-2xl border bg-card p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {realMode
                ? "Ce que vous auriez aujourd'hui, en euros constants"
                : "Ce que vous auriez aujourd'hui"}
            </span>
            <span className="font-heading tnum text-5xl font-bold leading-none">
              {formatEur(metrics.finalValue)}
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
                  gainPositive
                    ? "bg-[var(--pos)]/12 text-[var(--pos-text)]"
                    : "bg-[var(--neg)]/12 text-[var(--neg-text)]"
                }`}
              >
                <TrendingUp
                  className={`size-3.5 ${gainPositive ? "" : "rotate-180"}`}
                />
                {gainPositive ? "+" : ""}
                {formatEur(metrics.totalGain)}{" "}
                {gainPositive ? "de gains" : "de pertes"}
              </span>
              <span className="text-[13px] text-muted-foreground">
                soit {formatSignedPercent(metrics.totalReturn)} des{" "}
                {formatEur(metrics.totalInvested)} versés
                {realMode &&
                  ` · ${formatEur(result.metrics.finalValue)} en euros courants`}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
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
        </div>

        <div className="h-[320px]">
          <MainChart
            mode={mode}
            series={result.series}
            assets={assets}
            benchmarkLabel={benchmarkLabel}
            logScale={logScale}
            realMode={realMode}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {mode === "value" &&
            (realMode
              ? "Valeur du portefeuille, capital cumulé investi et référence, en euros constants du premier jour."
              : "Valeur du portefeuille, capital cumulé investi et référence, en euros.")}
          {mode === "contribution" &&
            "Valeur de chaque ligne, empilée : la hauteur totale est la valeur du portefeuille."}
          {mode === "weights" &&
            "Poids de chaque ligne dans le portefeuille. La dérive entre deux rééquilibrages s'y lit directement."}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Le rendement de l'argent placé, et non le rendement annualisé de
            l'allocation. Les deux sont justes, mais « ça rapporte X % par an »
            se lit spontanément comme « mon argent croît de X % par an », ce qui
            est la définition du premier. Le second, comparable aux chiffres
            publiés des indices, reste dans les ratios d'expert. */}
        <PlainStat
          label="Ça rapporte"
          value={
            headlineReturn === null
              ? "—"
              : `${formatPercent(headlineReturn)} par an`
          }
          hint={
            headlineReturn === null
              ? "aucun versement à faire fructifier"
              : `sur votre argent, versements compris, sur ${metrics.effectiveYears.toFixed(0)} ans`
          }
          tone={
            headlineReturn === null
              ? undefined
              : headlineReturn >= 0
                ? "positive"
                : "negative"
          }
        />
        <PlainStat
          label="Le pire moment"
          value={formatPercent(metrics.drawdown.maxDrawdown)}
          hint={
            metrics.drawdown.recoveryDate
              ? `effacé en ${formatDuration(metrics.drawdown.recoveryDays)}`
              : metrics.drawdown.troughDate
                ? "pas encore effacé sur la période"
                : "aucune baisse sur la période"
          }
          tone="negative"
        />
        <PlainStat
          label="Ce que ça coûte"
          value={formatEur(metrics.fees.total)}
          hint={`de frais, soit ${formatEur(metrics.feeImpact)} de manque à gagner`}
        />
      </div>

      <Section
        title="Et pour la suite ?"
        description="Ce que cette allocation pourrait devenir — un éventail de scénarios fondé sur le passé, pas une prévision."
      >
        <ProjectionPanel
          // Métriques nominales, délibérément : la projection gère sa propre
          // hypothèse d'inflation. Lui passer le jeu déflaté ferait retrancher
          // l'inflation deux fois.
          metrics={result.metrics}
          realCagr={realMode ? result.metrics.real!.cagr : null}
          monthlyReturns={result.analytics.monthlyPortfolioReturns}
          defaultInitialAmount={data.params.initialAmount}
          defaultMonthlyContribution={data.params.monthlyContribution}
        />
      </Section>

      {/* --- Détails d'expert ----------------------------------------------- */}

      <ExpertDetails storageKey="strategy-expert-details">
        <div className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ratios{realMode && " · euros constants"}
            </h2>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {scores.map((score) => (
                <MetricCard key={score.key} score={score} compact />
              ))}
            </div>
          </section>

          <Section
            title="Détail par support"
            description="Ce que chaque ligne a coûté, vaut et rapporté. Les totaux retombent sur ceux du haut de page."
          >
            <AssetBreakdown
              performance={
                realMode && result.assetPerformanceReal
                  ? result.assetPerformanceReal
                  : result.assetPerformance
              }
              assets={assets}
              realMode={realMode}
            />
          </Section>

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
                {correlationText && (
                  <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                    {correlationText}
                  </p>
                )}
                <CorrelationHeatmap
                  correlation={result.analytics.correlation}
                />
              </Section>
            )}
          </div>

          <Section
            title="Robustesse de l'allocation"
            description="Ce que la composition tient, et ce qu'elle laisse de côté. Indépendant de la performance passée : un portefeuille peut avoir bien fait tout en étant fragile."
          >
            <RobustnessPanel
              report={analyseBacktestedStrategy(
                assets,
                result.analytics.correlation,
              )}
            />
          </Section>

          <div className="grid gap-5 rounded-2xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-3">
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
            <BreakdownDonut
              title="Par taille de capitalisation"
              slices={capBreakdown(assets)}
              // Muet quand le portefeuille est intégralement en actions :
              // préciser « sur la part actions (100 %) » n'apprend rien et
              // laisse croire à une restriction là où il n'y en a pas.
              note={
                equityShareOf(assets) >= 99.5
                  ? undefined
                  : `Sur la part actions du portefeuille (${formatPercent(
                      equityShareOf(assets) / 100,
                      0,
                    )}).`
              }
              emptyLabel="Aucune poche actions dans ce portefeuille."
            />
          </div>
        </div>
      </ExpertDetails>
    </div>
  );
}

export function ResultsCenterSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 lg:px-2 lg:py-1">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-[460px]" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Récupération des cours et calcul en cours. Le premier backtest d&apos;une
        stratégie télécharge l&apos;historique complet de ses actifs ; les
        suivants sont immédiats.
      </p>
    </div>
  );
}
