import { cn } from "@/lib/utils";
import type { PeaVerdict } from "./types";

/**
 * Pastille d'éligibilité PEA.
 *
 * Trois états et non deux : « inconnu » concerne les actifs ajoutés hors
 * catalogue, pour lesquels aucune source ne donne l'éligibilité. Les afficher
 * comme non éligibles serait une affirmation que rien ne soutient.
 *
 * La couleur ne porte jamais l'information seule — le texte la dit aussi.
 */
export function PeaBadge({
  eligible,
  className,
}: {
  eligible: boolean | null;
  className?: string;
}) {
  const style =
    eligible === true
      ? "border-[var(--pos)]/40 bg-[var(--pos)]/10 text-[var(--pos-text)]"
      : eligible === false
        ? "border-border bg-muted text-muted-foreground"
        : "border-dashed border-border bg-transparent text-muted-foreground";

  const label =
    eligible === true ? "PEA" : eligible === false ? "CTO" : "PEA ?";

  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11px] font-medium",
        style,
        className,
      )}
      title={
        eligible === true
          ? "Éligible au PEA"
          : eligible === false
            ? "Compte-titres uniquement"
            : "Éligibilité au PEA inconnue"
      }
    >
      {label}
    </span>
  );
}

/** Verdict d'ensemble affiché sous l'allocation. */
export function PeaVerdictBadge({ verdict }: { verdict: PeaVerdict }) {
  const config = {
    eligible: {
      label: "Éligible PEA",
      className: "border-[var(--pos)]/40 bg-[var(--pos)]/10 text-[var(--pos-text)]",
    },
    ineligible: {
      label: "Non éligible PEA",
      className: "border-[var(--neg)]/40 bg-[var(--neg)]/10 text-[var(--neg-text)]",
    },
    unknown: {
      label: "Éligibilité incertaine",
      className: "border-dashed text-muted-foreground",
    },
  }[verdict];

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded border px-2 text-xs font-medium",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
