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
import { formatMonthShort, formatPercent, formatRatio } from "@/lib/utils/format";

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
 * Courbes superposées, base 100.
 *
 * Une seule échelle pour toutes les stratégies : c'est précisément l'intérêt de
 * la normalisation. Superposer des montants en euros comparerait des capitaux
 * de départ, et il faudrait alors deux axes — un procédé qui laisse l'auteur du
 * graphique décider où les courbes se croisent.
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
              tickFormatter={(value: number) => formatRatio(value, 0)}
            />
            <ReferenceLine y={100} stroke="var(--axis)" strokeDasharray="3 3" />
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
                      value: formatRatio(Number(point[strategy.id] ?? 0), 1),
                      color: strategy.color,
                    }))}
                    footer="Base 100 au début de la période commune"
                  />
                );
              }}
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
        items={strategies.map((s) => ({ label: s.name, color: s.color }))}
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
