"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ProjectionResult } from "@/lib/engine/projection";
import { REFERENCE_COLORS } from "@/lib/utils/asset-palette";
import { formatEur, formatEurCompact } from "@/lib/utils/format";

/**
 * Éventail de projection.
 *
 * L'encodage est **séquentiel** et non catégoriel : les bandes représentent une
 * même grandeur à des degrés de confiance différents, elles partagent donc une
 * seule teinte à des opacités croissantes. Leur donner des couleurs distinctes
 * suggérerait des séries indépendantes.
 *
 * Le message du graphique est la **largeur**, pas la médiane. La courbe médiane
 * est volontairement fine et le capital engagé apparaît en pointillé : ce qui
 * doit sauter aux yeux, c'est l'écart entre les scénarios, pas un chiffre
 * central qui ne se réalisera pas.
 */
export function ProjectionFanChart({
  projection,
  monthlyContribution,
  logScale,
}: {
  projection: ProjectionResult;
  monthlyContribution: number;
  /** Échelle logarithmique : indispensable dès que l'éventail traverse
   *  plusieurs ordres de grandeur, ce qui arrive vite sur un horizon long ou
   *  une stratégie volatile. En linéaire, la bande haute écrase tout le reste
   *  et la médiane se confond avec l'axe. */
  logScale: boolean;
}) {
  const data = useMemo(() => {
    const points = projection.points.map((point) => ({
      month: point.month,
      years: point.month / 12,
      band90: [point.p5, point.p95] as [number, number],
      band50: [point.p25, point.p75] as [number, number],
      p50: point.p50,
      invested: point.invested,
      p5: point.p5,
      p25: point.p25,
      p75: point.p75,
      p95: point.p95,
    }));

    // Un logarithme de zéro n'existe pas. Quand la projection démarre sans
    // capital, le premier point vaut zéro partout : on l'écarte du tracé
    // logarithmique plutôt que de laisser la courbe disparaître. Dès le
    // deuxième mois, le premier versement rend toutes les valeurs positives.
    return logScale ? points.filter((point) => point.p5 > 0) : points;
  }, [projection, logScale]);

  return (
    <div className="space-y-2">
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke="var(--grid)"
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="years"
              type="number"
              domain={[0, "dataMax"]}
              stroke="var(--axis)"
              fontSize={11}
              tickLine={false}
              tickFormatter={(value: number) => `${Math.round(value)} an${value > 1 ? "s" : ""}`}
              minTickGap={40}
            />
            <YAxis
              stroke="var(--axis)"
              fontSize={11}
              tickLine={false}
              width={64}
              scale={logScale ? "log" : "auto"}
              domain={logScale ? ["auto", "auto"] : [0, "auto"]}
              allowDataOverflow={logScale}
              tickFormatter={formatEurCompact}
            />

            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof data)[number];

                const rows: [string, number][] = [
                  ["Très favorable (95e)", point.p95],
                  ["Favorable (75e)", point.p75],
                  ["Médiane", point.p50],
                  ["Défavorable (25e)", point.p25],
                  ["Très défavorable (5e)", point.p5],
                ];

                return (
                  <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
                    <p className="mb-1.5 font-medium">
                      Dans {Math.round(point.years)} an
                      {point.years >= 2 ? "s" : ""}
                    </p>
                    <ul className="space-y-0.5">
                      {rows.map(([label, value]) => (
                        <li key={label} className="flex items-center gap-3">
                          <span className="flex-1 text-muted-foreground">
                            {label}
                          </span>
                          <span className="tnum font-medium">
                            {formatEur(value)}
                          </span>
                        </li>
                      ))}
                      <li className="mt-1 flex items-center gap-3 border-t pt-1">
                        <span className="flex-1 text-muted-foreground">
                          Capital engagé
                        </span>
                        <span className="tnum">{formatEur(point.invested)}</span>
                      </li>
                    </ul>
                  </div>
                );
              }}
            />

            <Area
              dataKey="band90"
              stroke="none"
              fill="var(--series-1)"
              fillOpacity={0.14}
              isAnimationActive={false}
            />
            <Area
              dataKey="band50"
              stroke="none"
              fill="var(--series-1)"
              fillOpacity={0.28}
              isAnimationActive={false}
            />
            <Line
              dataKey="p50"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {monthlyContribution > 0 && (
              <Line
                dataKey="invested"
                stroke={REFERENCE_COLORS.invested}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-4 rounded-sm"
            style={{ backgroundColor: "var(--series-1)", opacity: 0.14 }}
          />
          90 % des scénarios
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-4 rounded-sm"
            style={{ backgroundColor: "var(--series-1)", opacity: 0.28 }}
          />
          50 % des scénarios
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0.5 w-4 rounded-full"
            style={{ backgroundColor: "var(--series-1)" }}
          />
          Médiane
        </li>
        {monthlyContribution > 0 && (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, ${REFERENCE_COLORS.invested} 0 4px, transparent 4px 7px)`,
              }}
            />
            Capital engagé
          </li>
        )}
      </ul>
    </div>
  );
}
