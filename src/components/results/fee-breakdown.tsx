import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BacktestMetrics } from "@/lib/engine/types";
import { formatEur, formatPercent } from "@/lib/utils/format";

/**
 * Détail des frais.
 *
 * Deux chiffres distincts, et la distinction est le cœur du tableau : le total
 * prélevé, et le manque à gagner. Le second est toujours le plus élevé, parce
 * qu'un euro de frais payé la première année n'a pas seulement coûté un euro —
 * il a aussi cessé de produire des intérêts pendant toute la durée restante.
 * C'est cet écart qui explique qu'un TER de 0,38 % coûte bien plus que 0,38 %.
 */
export function FeeBreakdown({ metrics }: { metrics: BacktestMetrics }) {
  const rows = [
    {
      label: "Frais courants (TER)",
      value: metrics.fees.ter,
      hint: `${formatPercent(metrics.weightedTer)} par an, pondérés`,
    },
    {
      label: "Courtage",
      value: metrics.fees.brokerage,
      hint: "Versements et rééquilibrages",
    },
    {
      label: "Spread",
      value: metrics.fees.spread,
      hint: "À chaque transaction",
    },
  ];

  const share =
    metrics.finalValueGross > 0
      ? metrics.feeImpact / metrics.finalValueGross
      : 0;

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Poste</TableHead>
            <TableHead className="text-right">Cumul</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell>
                <span className="block">{row.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.hint}
                </span>
              </TableCell>
              <TableCell className="tnum text-right align-top">
                {formatEur(row.value)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="font-medium">
            <TableCell>Total prélevé</TableCell>
            <TableCell className="tnum text-right">
              {formatEur(metrics.fees.total)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <div className="rounded-xl border p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm">Manque à gagner total</span>
          <span className="tnum text-lg font-semibold text-[var(--neg-text)]">
            {formatEur(metrics.feeImpact)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Écart avec une simulation identique sans aucun frais, qui aurait
          terminé à {formatEur(metrics.finalValueGross)} — soit{" "}
          {formatPercent(share)} de la valeur finale. Le montant dépasse le
          total prélevé car les sommes retirées tôt ne produisent plus
          d&apos;intérêts jusqu&apos;au terme.
        </p>
      </div>
    </div>
  );
}
