"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Shapes } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { createStrategy } from "@/actions/strategies";
import { RobustnessPanel } from "@/components/diversification/robustness-panel";
import { MetricGauge } from "@/components/results/metric-gauge";
import { PeaBadge } from "@/components/strategy-editor/pea-badge";
import { Button } from "@/components/ui/button";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { analyseDiversification } from "@/lib/diversification/score";
import type { AxisScore } from "@/lib/diversification/types";
import {
  CORE_OPTIONS,
  DEFAULT_ALLOCATION,
  ENVELOPES,
  expandAllocation,
  toHoldings,
  type Allocation,
} from "@/lib/diversify/blocks";
import { cn } from "@/lib/utils";
import { formatPercent, formatRatio } from "@/lib/utils/format";
import {
  DEFAULT_STRATEGY_FORM,
  strategyFormSchema,
} from "@/lib/validation/strategy.schema";
import {
  StepCore,
  StepEnvelope,
  StepGeography,
  StepSize,
} from "./steps";

/**
 * Parcours de diversification.
 *
 * Il se distingue du parcours guidé pour débutants sur un point : celui-là
 * traduit un horizon et un tempérament en curseur actions/obligations, celui-ci
 * suppose l'arbitrage déjà fait et travaille la **structure de la poche
 * actions** — les zones, les secteurs, les tailles d'entreprise.
 *
 * Le verdict de robustesse reste affiché en permanence à côté des étapes, et se
 * recalcule à chaque mouvement. C'est possible parce que l'analyse est
 * structurelle : elle ne lit que des décompositions curatées, sans backtest ni
 * appel réseau. C'est aussi tout l'intérêt du parcours — on voit un curseur
 * faire basculer une jauge, ce qu'aucun texte explicatif ne remplace.
 *
 * Rien n'est écrit tant que la stratégie n'est pas créée à la dernière étape.
 */

const STEPS = [
  { id: "enveloppe", label: "Enveloppe" },
  { id: "socle", label: "Socle" },
  { id: "zones", label: "Zones" },
  { id: "tailles", label: "Tailles" },
  { id: "verdict", label: "Vérification" },
] as const;

/** Ligne d'axe compacte, pour la colonne latérale.
 *
 *  Le panneau complet emploie des cartes trop larges pour 360 pixels ; ici on
 *  garde ce qui bouge — la jauge et le libellé de niveau — et on renvoie le
 *  reste aux constats affichés en pleine largeur. */
function AxisLine({ axis }: { axis: AxisScore }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs">{axis.threshold.label}</span>
        <span className="tnum shrink-0 text-xs font-bold">
          {axis.value === null
            ? "—"
            : axis.threshold.format === "percent"
              ? formatPercent(axis.value / 100, 0)
              : formatRatio(axis.value)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <MetricGauge level={axis.level} levelLabel={axis.levelLabel} />
        <span className="truncate text-[11px] text-muted-foreground">
          {axis.levelLabel ??
            (axis.threshold.needsBacktest ? "après le backtest" : "—")}
        </span>
      </div>
    </div>
  );
}

/** Frais courants pondérés de l'allocation, en fraction.
 *
 *  Calculé ici plutôt que repris du moteur : le parcours n'a pas encore lancé
 *  de backtest, et la moyenne pondérée des TER ne demande rien d'autre que les
 *  poids et le catalogue. */
function weightedTer(
  lines: { ticker: string; weightPercent: number }[],
  byTicker: Map<string, CatalogAsset>,
): number {
  let total = 0;
  for (const line of lines) {
    const ter = byTicker.get(line.ticker)?.ter;
    if (ter === null || ter === undefined) continue;
    total += (line.weightPercent / 100) * Number(ter);
  }
  return total;
}

export function DiversifyShell({ catalog }: { catalog: CatalogAsset[] }) {
  const router = useRouter();
  const [creating, startCreate] = useTransition();

  const [stepIndex, setStepIndex] = useState(0);
  const [allocation, setAllocation] = useState<Allocation>(DEFAULT_ALLOCATION);

  const patch = (update: Partial<Allocation>) => {
    setAllocation((current) => {
      const next = { ...current, ...update };

      // Changer d'enveloppe peut rendre un socle inconstructible — le monde
      // entier n'existe qu'en compte-titres. Retomber sur le socle par défaut
      // vaut mieux que de garder une sélection qui ne produirait aucune ligne.
      if (update.envelope) {
        const core = CORE_OPTIONS.find((option) => option.id === next.coreId);
        if (!core?.envelopes.includes(next.envelope)) next.coreId = "world";
      }

      return next;
    });
  };

  const lines = useMemo(() => expandAllocation(allocation), [allocation]);

  const report = useMemo(
    () => analyseDiversification(toHoldings(lines, catalog)),
    [lines, catalog],
  );

  const byTicker = useMemo(
    () => new Map(catalog.map((asset) => [asset.tickerYahoo, asset])),
    [catalog],
  );

  const step = STEPS[stepIndex];

  function create() {
    const assetsPayload = lines.map((line) => ({
      assetId: byTicker.get(line.ticker)?.id ?? "",
      weightPercent: Math.round(line.weightPercent * 10) / 10,
    }));

    if (assetsPayload.some((entry) => entry.assetId === "")) {
      toast.error("Un des supports proposés est introuvable au catalogue.");
      return;
    }

    // Les arrondis d'affichage peuvent faire tomber le total à 99,9 % : on
    // reporte l'écart sur la ligne la plus lourde, celle où il se voit le moins.
    const total = assetsPayload.reduce((sum, e) => sum + e.weightPercent, 0);
    if (assetsPayload.length > 0 && Math.abs(total - 100) > 0.001) {
      assetsPayload[0].weightPercent =
        Math.round((assetsPayload[0].weightPercent + 100 - total) * 10) / 10;
    }

    const parsed = strategyFormSchema.safeParse({
      ...DEFAULT_STRATEGY_FORM,
      name: `Portefeuille diversifié · ${ENVELOPES[allocation.envelope].label}`,
      assets: assetsPayload,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Allocation invalide.");
      return;
    }

    startCreate(async () => {
      const result = await createStrategy(parsed.data, "use-proxy");
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/strategies/${result.data.id}`);
    });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:py-8">
        <header className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Shapes className="size-6 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight">
              Diversifier un portefeuille
            </h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Un ETF monde n&apos;est pas un portefeuille diversifié : il est
            américain aux trois quarts, technologique au quart, et ne contient
            aucune petite entreprise. Ce parcours construit une allocation qui
            tient sur ces trois axes, et montre l&apos;effet de chaque choix au
            fur et à mesure.
          </p>

          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {STEPS.map((entry, index) => (
              <li key={entry.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={index > stepIndex}
                  onClick={() => setStepIndex(index)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors",
                    index === stepIndex && "bg-primary/10 font-medium text-primary",
                    index < stepIndex && "text-muted-foreground hover:bg-secondary",
                    index > stepIndex && "text-muted-foreground/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full text-[10px]",
                      index < stepIndex
                        ? "bg-[var(--pos)]/20 text-[var(--pos-text)]"
                        : "bg-secondary",
                    )}
                  >
                    {index < stepIndex ? <Check className="size-2.5" /> : index + 1}
                  </span>
                  {entry.label}
                </button>
                {index < STEPS.length - 1 && (
                  <span aria-hidden className="text-muted-foreground/30">
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <div className="rounded-2xl border bg-card p-5 lg:p-6">
              {step.id === "enveloppe" && (
                <StepEnvelope allocation={allocation} patch={patch} />
              )}
              {step.id === "socle" && (
                <StepCore allocation={allocation} patch={patch} />
              )}
              {step.id === "zones" && (
                <StepGeography allocation={allocation} patch={patch} />
              )}
              {step.id === "tailles" && (
                <StepSize allocation={allocation} patch={patch} />
              )}
              {step.id === "verdict" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="font-heading text-lg font-bold">
                      Ce que vous allez créer
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Le plan d&apos;investissement — montants, durée,
                      rééquilibrage — reste modifiable ensuite sur la fiche de la
                      stratégie, où le backtest se lancera.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="py-1.5 pr-3 text-left font-bold">
                            Support
                          </th>
                          <th className="px-3 py-1.5 text-left font-bold">
                            Enveloppe
                          </th>
                          <th className="px-3 py-1.5 text-right font-bold">
                            Frais
                          </th>
                          <th className="py-1.5 pl-3 text-right font-bold">
                            Poids
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => {
                          const asset = byTicker.get(line.ticker);
                          return (
                            <tr key={line.ticker} className="border-b last:border-b-0">
                              <td className="py-2 pr-3 font-bold">
                                {asset?.shortLabel ?? line.ticker}
                              </td>
                              <td className="px-3 py-2">
                                {asset && <PeaBadge eligible={asset.peaEligible} />}
                              </td>
                              <td className="tnum px-3 py-2 text-right">
                                {asset?.ter
                                  ? formatPercent(Number(asset.ter), 2)
                                  : "—"}
                              </td>
                              <td className="tnum py-2 pl-3 text-right font-bold">
                                {formatPercent(line.weightPercent / 100, 1)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <RobustnessPanel report={report} findingsOnly />
                </div>
              )}
            </div>

            {step.id !== "verdict" && (
              <div className="rounded-2xl border bg-card p-5">
                <h2 className="font-heading text-base font-bold">
                  Où en est le portefeuille
                </h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Recalculé à chaque changement, sans backtest : ces notes ne
                  dépendent que de la composition.
                </p>
                <RobustnessPanel report={report} findingsOnly />
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-3 rounded-2xl border bg-card p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Robustesse
              </h2>
              <div className="space-y-2">
                {report.axes.map((axis) => (
                  <AxisLine key={axis.key} axis={axis} />
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border bg-card p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Allocation · {lines.length} ligne{lines.length > 1 ? "s" : ""}
              </h2>
              <ul className="space-y-1.5">
                {lines.map((line) => {
                  const asset = byTicker.get(line.ticker);
                  return (
                    <li
                      key={line.ticker}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {asset?.shortLabel ?? line.ticker}
                      </span>
                      {asset && <PeaBadge eligible={asset.peaEligible} />}
                      <span className="tnum shrink-0 font-bold">
                        {formatPercent(line.weightPercent / 100, 1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t pt-2 text-[11px] text-muted-foreground">
                Frais courants pondérés :{" "}
                <span className="tnum font-bold text-foreground">
                  {formatPercent(weightedTer(lines, byTicker), 2)}
                </span>
              </p>
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => index - 1)}
          >
            <ArrowLeft className="size-4" />
            Retour
          </Button>

          {step.id === "verdict" ? (
            <Button
              size="lg"
              disabled={creating || lines.length === 0}
              onClick={create}
            >
              {creating && <Loader2 className="size-4 animate-spin" />}
              Créer la stratégie
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => setStepIndex((index) => index + 1)}
            >
              Continuer
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
