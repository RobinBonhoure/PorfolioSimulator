"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RollingReturnPoint } from "@/lib/engine/analytics";
import type { PeriodExtreme } from "@/lib/engine/types";
import { formatMonthShort, formatPercent, formatSignedPercent } from "@/lib/utils/format";
import { ChartLegend, ChartTooltip } from "./chart-tooltip";

type View = "annual" | "rolling";

const WINDOWS = [
  { key: "oneYear", label: "1 an", color: "var(--series-1)" },
  { key: "threeYear", label: "3 ans", color: "var(--series-3)" },
  { key: "fiveYear", label: "5 ans", color: "var(--series-7)" },
] as const;

const AXIS_STYLE = {
  stroke: "var(--axis)",
  fontSize: 11,
  tickLine: false,
} as const;

/**
 * Rendements par année civile et rendements glissants.
 *
 * Deux lectures complémentaires, séparées par un commutateur plutôt que
 * superposées : les barres annuelles disent ce qu'a rapporté chaque année
 * calendaire, les courbes glissantes disent ce qu'aurait obtenu un investisseur
 * entré à n'importe quelle date et resté un, trois ou cinq ans. La seconde
 * répond à une question que la première ne peut pas trancher — « et si
 * j'étais entré au mauvais moment ? ».
 *
 * Les barres portent le vert et le rouge sémantiques de la performance, seul
 * endroit où ces couleurs sont utilisées dans les graphiques ; les fenêtres
 * glissantes, elles, sont des séries à distinguer entre elles et prennent donc
 * des teintes de la palette catégorielle.
 */
export function RollingReturnsChart({
  annualReturns,
  rollingReturns,
}: {
  annualReturns: PeriodExtreme[];
  rollingReturns: RollingReturnPoint[];
}) {
  const [view, setView] = useState<View>("annual");

  const hasRolling = rollingReturns.some(
    (point) => point.oneYear !== null || point.threeYear !== null,
  );

  return (
    <div className="space-y-3">
      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <TabsList>
          <TabsTrigger value="annual">Par année</TabsTrigger>
          <TabsTrigger value="rolling" disabled={!hasRolling}>
            Glissant
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          {view === "annual" ? (
            <BarChart
              data={annualReturns}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="var(--grid)"
                strokeDasharray="2 4"
                vertical={false}
              />
              <XAxis dataKey="period" {...AXIS_STYLE} />
              <YAxis
                {...AXIS_STYLE}
                width={52}
                tickFormatter={(value: number) => formatPercent(value, 0)}
              />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip
                cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as PeriodExtreme;
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
                      <p className="mb-1 font-medium">{point.period}</p>
                      <p className="tnum">{formatSignedPercent(point.return)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="return" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {annualReturns.map((point) => (
                  <Cell
                    key={point.period}
                    fill={point.return >= 0 ? "var(--pos)" : "var(--neg)"}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart
              data={rollingReturns}
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
                tickFormatter={formatMonthShort}
                minTickGap={48}
              />
              <YAxis
                {...AXIS_STYLE}
                width={52}
                tickFormatter={(value: number) => formatPercent(value, 0)}
              />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip
                cursor={{ stroke: "var(--axis)" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as RollingReturnPoint;
                  return (
                    <ChartTooltip
                      date={String(label)}
                      rows={WINDOWS.filter(
                        (window) => point[window.key] !== null,
                      ).map((window) => ({
                        label: window.label,
                        value: formatSignedPercent(point[window.key]),
                        color: window.color,
                      }))}
                      footer="Rendement annualisé sur la fenêtre écoulée"
                    />
                  );
                }}
              />
              {WINDOWS.map((window) => (
                <Line
                  key={window.key}
                  dataKey={window.key}
                  stroke={window.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {view === "rolling" && (
        <ChartLegend
          items={WINDOWS.map((window) => ({
            label: window.label,
            color: window.color,
          }))}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {view === "annual"
          ? "Performance de chaque année civile. La première et la dernière année sont souvent partielles."
          : "Rendement annualisé obtenu en entrant à chaque date et en conservant la position pendant toute la fenêtre. Une courbe qui plonge sous zéro signale des périodes d'entrée qui n'ont rien rapporté sur la durée indiquée."}
      </p>
    </div>
  );
}
