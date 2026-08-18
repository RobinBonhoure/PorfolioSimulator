import { scoreColor } from "@/lib/utils/asset-palette";
import type { ScoreLevel } from "@/lib/engine/thresholds";
import { cn } from "@/lib/utils";

/**
 * Jauge à cinq crans.
 *
 * Les crans non atteints restent visibles en creux : montrer l'échelle
 * complète permet de lire « trois sur cinq » d'un coup d'œil, là où trois
 * segments isolés ne diraient rien de la position dans l'échelle.
 *
 * La couleur ne porte pas seule l'information — le libellé du niveau
 * l'accompagne partout où la jauge apparaît, et l'attribut `aria-label` la rend
 * accessible aux lecteurs d'écran.
 */
export function MetricGauge({
  level,
  levelLabel,
  className,
}: {
  level: ScoreLevel | null;
  levelLabel: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={
        level === null
          ? "Score non défini"
          : `${levelLabel} — niveau ${level} sur 5`
      }
    >
      {[1, 2, 3, 4, 5].map((step) => {
        const reached = level !== null && step <= level;
        return (
          <span
            key={step}
            className="h-1 w-3.5 rounded-full transition-colors"
            style={{
              backgroundColor: reached ? scoreColor(level) : "var(--muted)",
            }}
          />
        );
      })}
    </div>
  );
}
