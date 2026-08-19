"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  UNKNOWN_CATEGORY,
  type BreakdownSlice,
} from "@/lib/backtest/breakdowns";
import { colorForIndex } from "@/lib/utils/asset-palette";
import { formatPercent } from "@/lib/utils/format";

/**
 * Donut de répartition, avec sa légende chiffrée.
 *
 * La légende porte les libellés et les valeurs exactes : le donut donne la
 * silhouette, la liste donne les chiffres. Une part « Non renseigné » est
 * rendue en gris neutre, distincte de la palette catégorielle, pour qu'une
 * absence de donnée ne ressemble pas à une exposition réelle.
 */
export function BreakdownDonut({
  slices,
  title,
  emptyLabel,
}: {
  slices: BreakdownSlice[];
  title: string;
  emptyLabel: string;
}) {
  if (slices.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const colored = slices.map((slice, index) => ({
    ...slice,
    color:
      slice.category === UNKNOWN_CATEGORY
        ? "var(--muted-foreground)"
        : colorForIndex(index),
  }));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>

      <div className="flex items-center gap-4">
        <div className="size-[132px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={colored}
                dataKey="percent"
                nameKey="category"
                innerRadius="58%"
                outerRadius="100%"
                paddingAngle={1}
                startAngle={90}
                endAngle={-270}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {colored.map((slice, index) => (
                  <Cell key={slice.category + index} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const slice = payload[0].payload as BreakdownSlice & {
                    color: string;
                  };
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
                      <p className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 rounded-sm"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span>{slice.category}</span>
                        <span className="tnum font-medium">
                          {formatPercent(slice.percent / 100, 1)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="min-w-0 flex-1 space-y-1 text-xs">
          {colored.map((slice, index) => (
            <li
              key={slice.category + index}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color }}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  slice.category === UNKNOWN_CATEGORY
                    ? "italic text-muted-foreground"
                    : ""
                }`}
                title={slice.category}
              >
                {slice.category}
              </span>
              <span className="tnum shrink-0 text-muted-foreground">
                {formatPercent(slice.percent / 100, 1)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
