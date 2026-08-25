"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ResultAssetInfo } from "@/lib/backtest/run-for-strategy";
import type { BacktestSeries } from "@/lib/engine/types";
import { REFERENCE_COLORS, buildAssetPalette } from "@/lib/utils/asset-palette";
import { formatEur, formatMonthShort, formatPercent } from "@/lib/utils/format";
import { ChartLegend, ChartTooltip } from "./chart-tooltip";

export type MainChartMode = "value" | "contribution" | "weights";

interface ChartPoint {
  date: string;
  value: number;
  invested: number;
  benchmark: number | null;
  hasProxyData: boolean;
  [assetId: string]: string | number | boolean | null;
}

const AXIS_STYLE = {
  stroke: "var(--axis)",
  fontSize: 11,
  tickLine: false,
} as const;

/**
 * Graphique principal de l'écran de résultats.
 *
 * Trois lectures d'une même simulation, jamais superposées sur deux échelles :
 * la valeur en euros, la contribution de chaque ligne au résultat, et la
 * dérive des poids. Un axe secondaire aurait permis de tout mettre sur un seul
 * graphique, au prix de comparaisons visuelles trompeuses — deux courbes
 * d'échelles différentes se croisent là où l'auteur du graphique l'a décidé.
 *
 * Les périodes reconstituées par proxy sont matérialisées par une bande
 * hachurée : la courbe y est une reconstitution et non un historique, et rien
 * dans les chiffres seuls ne le dirait.
 */
export function MainChart({
  mode,
  series,
  assets,
  benchmarkLabel,
  logScale,
  realMode = false,
}: {
  mode: MainChartMode;
  series: BacktestSeries;
  assets: ResultAssetInfo[];
  benchmarkLabel: string | null;
  logScale: boolean;
  /** Affiche la courbe en euros constants. Le moteur fournit la série déjà
   *  déflatée : la vue se contente de choisir laquelle tracer. La référence,
   *  elle, reste nominale — elle sert à situer la stratégie face à un indice,
   *  pas à mesurer un pouvoir d'achat. */
  realMode?: boolean;
}) {
  const palette = useMemo(
    () => buildAssetPalette(assets.map((a) => a.id)),
    [assets],
  );

  const data = useMemo<ChartPoint[]>(() => {
    return series.portfolio.map((point, index) => {
      const row: ChartPoint = {
        date: point.date,
        value: realMode ? (point.realValue ?? point.value) : point.value,
        invested: realMode
          ? (point.realInvested ?? point.invested)
          : point.invested,
        benchmark: realMode
          ? (series.benchmark?.[index]?.realValue ??
            series.benchmark?.[index]?.value ??
            null)
          : (series.benchmark?.[index]?.value ?? null),
        hasProxyData: point.hasProxyData,
      };

      const byAsset = series.byAsset[index]?.valueByAsset ?? {};
      const total = Object.values(byAsset).reduce((sum, v) => sum + v, 0);

      for (const asset of assets) {
        const assetValue = byAsset[asset.id] ?? 0;
        row[asset.id] =
          mode === "weights"
            ? total > 0
              ? (assetValue / total) * 100
              : 0
            : assetValue;
      }

      return row;
    });
  }, [series, assets, mode, realMode]);

  /** Bornes des plages reconstituées par proxy, pour les hachurer. */
  const proxyRanges = useMemo(() => {
    const ranges: { from: string; to: string }[] = [];
    let start: string | null = null;

    for (const point of series.portfolio) {
      if (point.hasProxyData && start === null) start = point.date;
      if (!point.hasProxyData && start !== null) {
        ranges.push({ from: start, to: point.date });
        start = null;
      }
    }
    if (start !== null) {
      ranges.push({ from: start, to: series.portfolio.at(-1)!.date });
    }

    return ranges;
  }, [series.portfolio]);

  const legendItems =
    mode === "value"
      ? [
          { label: "Portefeuille", color: "var(--primary)" },
          { label: "Capital investi", color: REFERENCE_COLORS.invested, dashed: true },
          ...(benchmarkLabel
            ? [{ label: benchmarkLabel, color: REFERENCE_COLORS.benchmark, dashed: true }]
            : []),
        ]
      : assets.map((asset) => ({
          label: asset.label,
          color: palette.get(asset.id)!,
        }));

  const isPercentMode = mode === "weights";

  const formatValue = (value: number) =>
    isPercentMode ? formatPercent(value / 100, 1) : formatEur(value);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const point = payload[0].payload as ChartPoint;

    const rows =
      mode === "value"
        ? [
            { label: "Portefeuille", value: formatEur(point.value), color: "var(--primary)" },
            {
              label: "Capital investi",
              value: formatEur(point.invested),
              color: REFERENCE_COLORS.invested,
            },
            ...(point.benchmark !== null && benchmarkLabel
              ? [
                  {
                    label: benchmarkLabel,
                    value: formatEur(point.benchmark),
                    color: REFERENCE_COLORS.benchmark,
                  },
                ]
              : []),
          ]
        : assets.map((asset) => ({
            label: asset.label,
            value: formatValue(Number(point[asset.id] ?? 0)),
            color: palette.get(asset.id)!,
          }));

    return (
      <ChartTooltip
        date={String(label)}
        rows={rows}
        footer={
          point.hasProxyData
            ? "Période reconstituée à partir d'un indice de substitution"
            : undefined
        }
      />
    );
  };

  const axes = (
    <>
      <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
      <XAxis
        dataKey="date"
        {...AXIS_STYLE}
        tickFormatter={formatMonthShort}
        minTickGap={48}
      />
      <YAxis
        {...AXIS_STYLE}
        width={64}
        scale={logScale && !isPercentMode ? "log" : "auto"}
        domain={
          isPercentMode
            ? [0, 100]
            : logScale
              ? ["auto", "auto"]
              : [0, "auto"]
        }
        tickFormatter={(value: number) =>
          isPercentMode ? `${value} %` : formatEur(value)
        }
        allowDataOverflow={logScale}
      />
      <Tooltip content={renderTooltip} cursor={{ stroke: "var(--axis)" }} />
      {proxyRanges.map((range) => (
        <ReferenceArea
          key={range.from}
          x1={range.from}
          x2={range.to}
          fill="var(--muted-foreground)"
          fillOpacity={0.08}
          ifOverflow="extendDomain"
        />
      ))}
    </>
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "value" ? (
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="portfolio-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity={0.16} />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {axes}
              <Area
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2.5}
                fill="url(#portfolio-fill)"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="invested"
                stroke={REFERENCE_COLORS.invested}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              {benchmarkLabel && (
                <Line
                  dataKey="benchmark"
                  stroke={REFERENCE_COLORS.benchmark}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </AreaChart>
          ) : (
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              {axes}
              {assets.map((asset) => (
                <Area
                  key={asset.id}
                  dataKey={asset.id}
                  stackId="allocation"
                  stroke="var(--card)"
                  strokeWidth={1}
                  fill={palette.get(asset.id)}
                  fillOpacity={0.85}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      <ChartLegend items={legendItems} />
    </div>
  );
}
