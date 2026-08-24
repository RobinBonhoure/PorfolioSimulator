"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartLegend, ChartTooltip } from "@/components/charts/chart-tooltip";
import type { ComparisonPoint } from "@/lib/backtest/compare";
import { INVESTED_KEY } from "@/lib/backtest/comparison-keys";
import { REFERENCE_COLORS } from "@/lib/utils/asset-palette";
import {
  formatEur,
  formatEurCompact,
  formatMonthShort,
  formatPercent,
} from "@/lib/utils/format";

interface SeriesInfo {
  id: string;
  name: string;
  color: string;
}

const AXIS_STYLE = {
  stroke: "var(--axis)",
  fontSize: 11,
  tickLine: false,
} as const;

/**
 * Courbes superposées, en euros.
 *
 * Une seule échelle pour tout le monde, sans que cela demande de normalisation :
 * la comparaison impose le même plan à tous les éléments, donc le même capital
 * de départ et le même échéancier de versements. Les courbes partent du montant
 * saisi et se lisent directement en euros, ce qu'une base 100 ne permettait pas.
 *
 * Le capital versé sert de repère commun : au-dessus, l'allocation a rapporté
 * plus que ce qu'on y a mis ; en dessous, elle a détruit de la valeur.
 */
export function CompareValueChart({
  series,
  strategies,
}: {
  series: ComparisonPoint[];
  strategies: SeriesInfo[];
}) {
  return (
    <div className="space-y-2">
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke="var(--grid)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              {...AXIS_STYLE}
              tickFormatter={(value: string) => formatMonthShort(value)}
              minTickGap={48}
            />
            <YAxis
              {...AXIS_STYLE}
              width={56}
              domain={[0, "auto"]}
              // Abrégé, pas complet : comparer un support à une allocation peut
              // faire tenir 25 k€ et 6 M€ sur le même axe, et « 6 646 332 € »
              // en graduation mangerait le quart du graphique.
              tickFormatter={(value: number) => formatEurCompact(value)}
            />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as ComparisonPoint;
                return (
                  <ChartTooltip
                    date={String(label)}
                    rows={[
                      ...strategies.map((strategy) => ({
                        label: strategy.name,
                        value: formatEur(Number(point[strategy.id] ?? 0)),
                        color: strategy.color,
                      })),
                      {
                        label: "Capital investi",
                        value: formatEur(Number(point[INVESTED_KEY] ?? 0)),
                        color: REFERENCE_COLORS.invested,
                      },
                    ]}
                    footer="Même plan d'investissement pour tous les éléments"
                  />
                );
              }}
            />
            <Line
              dataKey={INVESTED_KEY}
              stroke={REFERENCE_COLORS.invested}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            {strategies.map((strategy) => (
              <Line
                key={strategy.id}
                dataKey={strategy.id}
                stroke={strategy.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend
        items={[
          ...strategies.map((s) => ({ label: s.name, color: s.color })),
          {
            label: "Capital investi",
            color: REFERENCE_COLORS.invested,
            dashed: true,
          },
        ]}
      />
    </div>
  );
}

/**
 * Courbes underwater superposées.
 *
 * Elles répondent à une question que la courbe de valeur masque : à quel point
 * et pendant combien de temps chaque stratégie est restée sous son dernier
 * sommet. Deux stratégies au rendement identique peuvent avoir infligé des
 * traversées du désert très différentes.
 */
export function CompareDrawdownChart({
  drawdowns,
  strategies,
}: {
  drawdowns: ComparisonPoint[];
  strategies: SeriesInfo[];
}) {
  return (
    <div className="space-y-2">
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={drawdowns}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--grid)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              {...AXIS_STYLE}
              tickFormatter={(value: string) => formatMonthShort(value)}
              minTickGap={48}
            />
            <YAxis
              {...AXIS_STYLE}
              width={56}
              tickFormatter={(value: number) => formatPercent(value, 0)}
            />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as ComparisonPoint;
                return (
                  <ChartTooltip
                    date={String(label)}
                    rows={strategies.map((strategy) => ({
                      label: strategy.name,
                      value: formatPercent(Number(point[strategy.id] ?? 0)),
                      color: strategy.color,
                    }))}
                    footer="Écart au dernier sommet atteint"
                  />
                );
              }}
            />
            {strategies.map((strategy) => (
              <Line
                key={strategy.id}
                dataKey={strategy.id}
                stroke={strategy.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Zéro signifie « au plus haut historique ». Plus une courbe reste
        profonde et longtemps, plus la stratégie a demandé de patience.
      </p>
    </div>
  );
}
