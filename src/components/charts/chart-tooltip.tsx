"use client";

import { formatDate } from "@/lib/utils/format";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * Infobulle commune à tous les graphiques.
 *
 * Recharts fournit une infobulle par défaut peu lisible sur fond sombre et sans
 * formatage français ; celle-ci reprend les jetons de thème et les formateurs
 * de l'application, ce qui garantit que la valeur lue au survol s'écrit
 * exactement comme la même valeur dans un tableau.
 *
 * Les libellés portent leur pastille de couleur, jamais la couleur seule.
 */
export function ChartTooltip({
  date,
  rows,
  footer,
}: {
  date: string;
  rows: TooltipRow[];
  footer?: string;
}) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{formatDate(date)}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            {row.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="flex-1 truncate text-muted-foreground">
              {row.label}
            </span>
            <span className="tnum font-medium">{row.value}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <p className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
          {footer}
        </p>
      )}
    </div>
  );
}

/** Légende horizontale, présente dès qu'il y a deux séries ou plus. */
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0.5 w-4 shrink-0 rounded-full"
            style={
              item.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 4px, transparent 4px 7px)`,
                  }
                : { backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
