import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { ComparedStrategy } from "@/lib/backtest/compare";
import { METRIC_THRESHOLDS, type MetricKey } from "@/lib/engine/thresholds";
import { scoreMetric } from "@/lib/engine/scoring";
import type { BacktestMetrics } from "@/lib/engine/types";
import { MetricGauge } from "@/components/results/metric-gauge";
import { formatEur, formatPercent, formatRatio } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/**
 * Tableau comparatif.
 *
 * Stratégies en colonnes, métriques en lignes : c'est le sens de lecture qui
 * permet de comparer une ligne d'un coup d'œil, alors que l'inverse obligerait
 * à sauter d'une colonne à l'autre.
 *
 * La meilleure valeur de chaque ligne est mise en évidence, mais jamais par la
 * couleur seule — un fond léger **et** une graisse plus marquée, pour que la
 * distinction survive à une impression en noir et blanc comme à un daltonisme.
 */

interface Row {
  label: string;
  /** Extrait la valeur brute, `null` si non définie. */
  value: (metrics: BacktestMetrics) => number | null;
  format: (value: number | null) => string;
  /** Sens de l'avantage. `null` pour une ligne purement descriptive. */
  higherIsBetter: boolean | null;
  metricKey?: MetricKey;
}

const ROWS: Row[] = [
  {
    label: "Valeur finale",
    value: (m) => m.finalValue,
    format: (v) => (v === null ? "—" : formatEur(v)),
    higherIsBetter: true,
  },
  {
    label: "Capital investi",
    value: (m) => m.totalInvested,
    format: (v) => (v === null ? "—" : formatEur(v)),
    higherIsBetter: null,
  },
  {
    label: "Gain",
    value: (m) => m.totalGain,
    format: (v) => (v === null ? "—" : formatEur(v)),
    higherIsBetter: true,
  },
  {
    label: "Rendement annualisé",
    value: (m) => m.cagr,
    format: (v) => formatPercent(v),
    higherIsBetter: true,
    metricKey: "cagr",
  },
  {
    label: "Volatilité",
    value: (m) => m.volatility,
    format: (v) => formatPercent(v),
    higherIsBetter: false,
    metricKey: "volatility",
  },
  {
    label: "Baisse maximale",
    value: (m) => m.drawdown.maxDrawdown,
    format: (v) => formatPercent(v),
    higherIsBetter: true,
    metricKey: "maxDrawdown",
  },
  {
    label: "Sharpe",
    value: (m) => m.sharpe,
    format: (v) => formatRatio(v),
    higherIsBetter: true,
    metricKey: "sharpe",
  },
  {
    label: "Sortino",
    value: (m) => m.sortino,
    format: (v) => formatRatio(v),
    higherIsBetter: true,
    metricKey: "sortino",
  },
  {
    label: "Calmar",
    value: (m) => m.calmar,
    format: (v) => formatRatio(v),
    higherIsBetter: true,
    metricKey: "calmar",
  },
  {
    label: "Frais courants pondérés",
    value: (m) => m.weightedTer,
    format: (v) => formatPercent(v),
    higherIsBetter: false,
    metricKey: "weightedTer",
  },
  {
    label: "Frais prélevés",
    value: (m) => m.fees.total,
    format: (v) => (v === null ? "—" : formatEur(v)),
    higherIsBetter: false,
  },
  {
    label: "Manque à gagner",
    value: (m) => m.feeImpact,
    format: (v) => (v === null ? "—" : formatEur(v)),
    higherIsBetter: false,
  },
];

function bestIndex(values: (number | null)[], higherIsBetter: boolean | null) {
  if (higherIsBetter === null) return -1;

  let best = -1;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === null) continue;
    if (best === -1) {
      best = i;
      continue;
    }
    const current = values[best]!;
    if (higherIsBetter ? value > current : value < current) best = i;
  }

  // Toutes égales : ne rien mettre en avant plutôt que de désigner
  // arbitrairement la première colonne.
  const distinct = new Set(values.filter((v) => v !== null));
  return distinct.size <= 1 ? -1 : best;
}

export function CompareTable({
  strategies,
  colors,
}: {
  strategies: ComparedStrategy[];
  colors: Map<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 bg-card py-2 pr-3 text-left font-medium">
              Métrique
            </th>
            {strategies.map((strategy) => (
              <th
                key={strategy.id}
                className="min-w-[140px] px-3 py-2 text-right font-medium"
              >
                <span className="flex items-center justify-end gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: colors.get(strategy.id) }}
                  />
                  <span className="truncate" title={strategy.name}>
                    {strategy.name}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {ROWS.map((row) => {
            const values = strategies.map((s) => row.value(s.metrics));
            const best = bestIndex(values, row.higherIsBetter);
            const threshold = row.metricKey
              ? METRIC_THRESHOLDS[row.metricKey]
              : null;

            return (
              <tr key={row.label} className="border-b last:border-b-0">
                <th className="sticky left-0 bg-card py-1.5 pr-3 text-left font-normal text-muted-foreground">
                  {threshold ? (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <span className="cursor-help border-b border-dotted">
                          {row.label}
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80 space-y-2 text-sm">
                        <p className="font-medium">{threshold.label}</p>
                        <p className="text-muted-foreground">
                          {threshold.definition}
                        </p>
                        <p className="border-t pt-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Repère :{" "}
                          </span>
                          {threshold.reference}
                        </p>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    row.label
                  )}
                </th>

                {values.map((value, index) => {
                  const isBest = index === best;
                  const score = row.metricKey
                    ? scoreMetric(row.metricKey, value)
                    : null;

                  return (
                    <td
                      key={strategies[index].id}
                      className={cn(
                        "px-3 py-1.5 text-right align-middle",
                        isBest && "bg-[var(--pos)]/8 font-semibold",
                      )}
                    >
                      <span className="tnum block">{row.format(value)}</span>
                      {score && (
                        <span className="mt-1 flex justify-end">
                          <MetricGauge
                            level={score.level}
                            levelLabel={score.levelLabel}
                          />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-2 text-xs text-muted-foreground">
        La meilleure valeur de chaque ligne est surlignée et en gras. Les lignes
        purement descriptives, comme le capital investi, n&apos;ont pas de
        gagnant : investir davantage n&apos;est ni un avantage ni un défaut.
      </p>
    </div>
  );
}
