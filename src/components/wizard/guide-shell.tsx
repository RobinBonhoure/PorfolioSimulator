"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { createStrategy } from "@/actions/strategies";
import { Button } from "@/components/ui/button";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STRATEGY_FORM,
  strategyFormSchema,
} from "@/lib/validation/strategy.schema";
import { toEngineParams } from "@/lib/validation/to-engine-params";
import { DEFAULT_PROFILE, type WizardProfile } from "@/lib/wizard/profile";
import { recommendStrategies } from "@/lib/wizard/recommend";
import { StepProposals } from "./step-proposals";
import { StepRefine } from "./step-refine";
import { StepProject, StepSupports, StepTemperament } from "./steps-profile";

const STEPS = [
  { id: "projet", label: "Votre projet" },
  { id: "temperament", label: "Votre tempérament" },
  { id: "supports", label: "Compléments" },
  { id: "propositions", label: "Propositions" },
  { id: "affiner", label: "Choix des supports" },
] as const;

/**
 * Parcours de création accompagné.
 *
 * Une colonne centrée et une étape à la fois : le questionnaire n'a rien à
 * mettre en vis-à-vis avant l'étape des propositions, et fractionner les
 * questions évite la page-formulaire qui décourage.
 *
 * Le parcours ne crée la stratégie qu'à la toute fin. Tant qu'on n'a pas
 * validé, rien n'est écrit — on peut revenir en arrière, changer une réponse et
 * voir les propositions se recalculer, sans laisser de traces dans la liste.
 */
export function GuideShell({ catalog }: { catalog: CatalogAsset[] }) {
  const router = useRouter();
  const [creating, startCreate] = useTransition();

  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<WizardProfile>(DEFAULT_PROFILE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [substitutions, setSubstitutions] = useState<Record<string, string>>({});

  const patch = (update: Partial<WizardProfile>) => {
    setProfile((current) => ({ ...current, ...update }));
    // Changer une réponse invalide le choix précédent : les propositions ne
    // sont plus les mêmes, et conserver une sélection par son identifiant
    // ferait pointer vers une allocation qui n'existe plus.
    setSelectedId(null);
    setSubstitutions({});
  };

  const strategies = useMemo(() => recommendStrategies(profile), [profile]);

  const params = useMemo(
    () =>
      toEngineParams(
        {
          ...DEFAULT_STRATEGY_FORM,
          name: "aperçu",
          initialAmount: profile.initialAmount,
          monthlyContribution: profile.monthlyContribution,
          // Le backtest porte sur la durée disponible dans le passé ; l'horizon
          // déclaré regarde vers l'avant. Trente ans est le maximum accepté par
          // le formulaire, et davantage d'historique vaut toujours mieux.
          years: Math.min(30, Math.max(profile.horizonYears, 10)),
          assets: [],
        },
        // Historique complété par proxy, et ce n'est pas un détail. Les supports
        // recommandés sont les moins chers de leur indice, donc souvent les plus
        // récents : WPEA ne cote que depuis 2024. Sans proxy, chaque proposition
        // serait mesurée sur deux ans de marché haussier et afficherait une pire
        // baisse de 13 % pour une allocation à 75 % d'actions — un chiffre
        // rassurant et faux. Avec proxy, la période remonte à 2008 et traverse
        // deux vraies crises.
        "use-proxy",
      ),
    [profile.initialAmount, profile.monthlyContribution, profile.horizonYears],
  );

  const chosen = strategies.find((s) => s.id === selectedId) ?? null;

  /** Allocation finale, substitutions de supports appliquées. */
  const finalHoldings = useMemo(() => {
    if (!chosen) return [];
    return chosen.holdings.map((holding) => ({
      ...holding,
      ticker: substitutions[holding.ticker] ?? holding.ticker,
    }));
  }, [chosen, substitutions]);

  const step = STEPS[stepIndex];
  const canAdvance =
    step.id === "propositions" ? chosen !== null : stepIndex < STEPS.length - 1;

  function create() {
    if (!chosen) return;

    const byTicker = new Map(catalog.map((asset) => [asset.tickerYahoo, asset]));
    const assetsPayload = finalHoldings.map((holding) => ({
      assetId: byTicker.get(holding.ticker)?.id ?? "",
      weightPercent: holding.weightPercent,
    }));

    if (assetsPayload.some((entry) => entry.assetId === "")) {
      toast.error("Un des supports proposés est introuvable au catalogue.");
      return;
    }

    const parsed = strategyFormSchema.safeParse({
      ...DEFAULT_STRATEGY_FORM,
      name: `${chosen.name} · ${profile.horizonYears} ans`,
      initialAmount: profile.initialAmount,
      monthlyContribution: profile.monthlyContribution,
      years: Math.min(30, Math.max(profile.horizonYears, 10)),
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
      <div
        className={cn(
          "mx-auto space-y-6 px-4 py-6 lg:py-8",
          // L'étape des propositions affiche trois colonnes de backtest : elle
          // a besoin de plus de largeur que le questionnaire.
          step.id === "propositions" ? "max-w-5xl" : "max-w-2xl",
        )}
      >
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <h1 className="text-xl font-semibold tracking-tight">
              Construire un portefeuille
            </h1>
          </div>

          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {STEPS.map((entry, index) => (
              <li key={entry.id} className="flex items-center gap-2">
                <button
                  type="button"
                  // On peut revenir sur une étape franchie, jamais en sauter une.
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

        <div className="min-h-[320px]">
          {step.id === "projet" && (
            <StepProject profile={profile} patch={patch} />
          )}
          {step.id === "temperament" && (
            <StepTemperament profile={profile} patch={patch} />
          )}
          {step.id === "supports" && (
            <StepSupports profile={profile} patch={patch} />
          )}
          {step.id === "propositions" && (
            <StepProposals
              strategies={strategies}
              params={params}
              catalog={catalog}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {step.id === "affiner" && chosen && (
            <StepRefine
              holdings={chosen.holdings}
              catalog={catalog}
              substitutions={substitutions}
              onSubstitute={(original, replacement) =>
                setSubstitutions((current) => ({
                  ...current,
                  [original]: replacement,
                }))
              }
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="ghost"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => index - 1)}
          >
            <ArrowLeft className="size-4" />
            Retour
          </Button>

          {step.id === "affiner" ? (
            <Button disabled={creating || !chosen} onClick={create}>
              {creating && <Loader2 className="size-4 animate-spin" />}
              Créer la stratégie
            </Button>
          ) : (
            <Button
              disabled={!canAdvance}
              onClick={() => setStepIndex((index) => index + 1)}
            >
              {step.id === "propositions" && !chosen
                ? "Choisissez une allocation"
                : "Continuer"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
