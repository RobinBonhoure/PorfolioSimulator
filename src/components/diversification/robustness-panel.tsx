import { AlertTriangle, Check, Info, Lightbulb } from "lucide-react";

import { MetricGauge } from "@/components/results/metric-gauge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type {
  AxisScore,
  DiversificationReport,
  Finding,
  FindingSeverity,
} from "@/lib/diversification/types";
import { formatPercent, formatRatio } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/**
 * Verdict de robustesse : cinq jauges et une liste de constats.
 *
 * Pas de note globale sur cent, et c'est délibéré. Agréger cinq axes en un
 * chiffre supposerait de les pondérer entre eux — combien vaut un point de
 * recouvrement contre un point de concentration sectorielle ? Aucune réponse
 * n'est défendable, et le chiffre unique donnerait à cette pondération
 * arbitraire l'autorité d'une mesure. Cinq jauges obligent à regarder ce qui
 * est faible, ce qui est précisément l'objet de l'écran.
 *
 * La couleur ne porte jamais seule l'information : chaque jauge est doublée du
 * libellé de son niveau, et chaque constat d'une icône et d'un mot de gravité.
 */

function formatAxisValue(axis: AxisScore): string {
  if (axis.value === null) return "—";
  return axis.threshold.format === "percent"
    ? formatPercent(axis.value / 100, 0)
    : formatRatio(axis.value);
}

const SEVERITY: Record<
  FindingSeverity,
  { label: string; icon: typeof AlertTriangle; className: string }
> = {
  high: {
    label: "À corriger",
    icon: AlertTriangle,
    className: "text-[var(--neg-text)]",
  },
  medium: {
    label: "À regarder",
    icon: Lightbulb,
    className: "text-[var(--score-3)]",
  },
  info: { label: "À savoir", icon: Info, className: "text-muted-foreground" },
};

function AxisRow({ axis }: { axis: AxisScore }) {
  const pending = axis.value === null && axis.threshold.needsBacktest;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="cursor-help rounded-xl border bg-card px-3 py-2.5 transition-colors hover:bg-secondary/40">
          <p className="truncate text-[11px] font-bold text-muted-foreground">
            {axis.threshold.label}
          </p>

          <p className="font-heading tnum text-lg font-bold leading-tight">
            {formatAxisValue(axis)}
          </p>

          <div className="mt-1.5 flex items-center gap-2">
            <MetricGauge level={axis.level} levelLabel={axis.levelLabel} />
            <span className="truncate text-[11px] text-muted-foreground">
              {axis.levelLabel ?? (pending ? "après le backtest" : "non calculé")}
            </span>
          </div>

          {axis.detail && axis.level !== null && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {axis.detail}
            </p>
          )}
        </div>
      </HoverCardTrigger>

      <HoverCardContent className="w-80 space-y-2 text-sm" align="start">
        <p className="font-medium">{axis.threshold.question}</p>
        <p className="text-muted-foreground">{axis.threshold.definition}</p>
        <p className="text-muted-foreground">{axis.threshold.interpretation}</p>
        <p className="border-t pt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Repère : </span>
          {axis.threshold.reference}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const severity = SEVERITY[finding.severity];
  const Icon = severity.icon;

  return (
    <li className="flex gap-2.5 rounded-xl border bg-card p-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", severity.className)} />
      <div className="min-w-0 space-y-1">
        {/* La gravité est écrite, pas seulement colorée : l'icône et la teinte
            se perdent à l'impression comme chez un daltonien. */}
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              severity.className,
            )}
          >
            {severity.label}
          </span>
          <span className="text-sm font-bold leading-snug">{finding.title}</span>
        </p>
        <p className="text-xs leading-snug text-muted-foreground">
          {finding.detail}
        </p>
        <p className="text-xs leading-snug">
          <span className="font-bold">À faire : </span>
          {finding.action}
        </p>
      </div>
    </li>
  );
}

export function RobustnessPanel({
  report,
  /** Masque les jauges pour ne garder que les constats. Utile en colonne
   *  étroite, où cinq cartes écraseraient le reste. */
  findingsOnly = false,
}: {
  report: DiversificationReport;
  findingsOnly?: boolean;
}) {
  const actionable = report.findings.filter((f) => f.severity !== "info");

  return (
    <div className="space-y-4">
      {!findingsOnly && (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {report.axes.map((axis) => (
            <AxisRow key={axis.key} axis={axis} />
          ))}
        </div>
      )}

      {/* Le bandeau de succès ne dépend que des constats *actionnables* : une
          information sur une donnée manquante ne doit pas priver d'un verdict
          positif une allocation qui le mérite, ni disparaître pour autant. */}
      {actionable.length === 0 && (
        <p className="flex items-start gap-2 rounded-xl border bg-[var(--pos)]/8 p-3 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-[var(--pos-text)]" />
          <span>
            Aucun point faible marqué. L&apos;allocation est répartie sur
            plusieurs zones, plusieurs secteurs et plusieurs tailles
            d&apos;entreprise, sans support faisant double emploi.
          </span>
        </p>
      )}

      {report.findings.length > 0 && (
        <ul className="space-y-2">
          {report.findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </ul>
      )}
    </div>
  );
}
