import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { MetricScore } from "@/lib/engine/scoring";
import { formatPercent, formatRatio } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { MetricGauge } from "./metric-gauge";

export function formatMetricValue(score: MetricScore): string {
  if (score.value === null) return "—";
  return score.threshold.format === "percent"
    ? formatPercent(score.value)
    : formatRatio(score.value);
}

/**
 * Carte de métrique notée.
 *
 * Le contenu pédagogique n'est pas une décoration : une métrique financière
 * affichée sans définition ni point de comparaison n'informe que ceux qui la
 * connaissaient déjà. Chaque carte porte donc, au survol, ce que mesure la
 * métrique, comment la lire, et où se situe un portefeuille 100 % MSCI World.
 */
export function MetricCard({
  score,
  compact,
}: {
  score: MetricScore;
  compact?: boolean;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "cursor-help rounded-lg border bg-card transition-colors hover:bg-secondary/40",
            compact ? "px-3 py-2" : "px-3 py-2.5",
          )}
        >
          <p className="truncate text-[11px] text-muted-foreground">
            {score.threshold.label}
          </p>
          <p className="tnum text-lg font-semibold leading-tight">
            {formatMetricValue(score)}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <MetricGauge level={score.level} levelLabel={score.levelLabel} />
            <span className="truncate text-[11px] text-muted-foreground">
              {score.levelLabel ?? "non défini"}
            </span>
          </div>
        </div>
      </HoverCardTrigger>

      <HoverCardContent className="w-80 space-y-2 text-sm" align="start">
        <p className="font-medium">{score.threshold.label}</p>
        <p className="text-muted-foreground">{score.threshold.definition}</p>
        <p className="text-muted-foreground">{score.threshold.interpretation}</p>
        <p className="border-t pt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Repère : </span>
          {score.threshold.reference}
        </p>
        {score.value === null && (
          <p className="text-xs text-muted-foreground">
            Non calculable sur cette période : le dénominateur du ratio est nul.
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Carte de valeur brute, sans notation : montants et volumes. */
export function ValueCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum text-lg font-semibold leading-tight",
          tone === "positive" && "text-[var(--pos-text)]",
          tone === "negative" && "text-[var(--neg-text)]",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
