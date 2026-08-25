"use client";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createStrategy } from "@/actions/strategies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { strategyFormSchema } from "@/lib/validation/strategy.schema";
import { AllocationDonut } from "./allocation-donut";
import { AssetPicker } from "./asset-picker";
import {
  BENCHMARK_OPTIONS,
  ChoiceField,
  MiniField,
  PERIOD_OPTIONS,
  ToggleField,
} from "./controls";
import { PresetPicker } from "./preset-picker";
import { useStrategyForm } from "./use-strategy-form";

const PERIOD_LABELS: Record<string, string> = {
  none: "Sans rééquilibrage",
  monthly: "Rééquilibrage mensuel",
  quarterly: "Rééquilibrage trimestriel",
  semiannual: "Rééquilibrage semestriel",
  annual: "Rééquilibrage annuel",
};

/** Champ de montant : valeur alignée à droite, unité en suffixe. */
function AmountField({
  id,
  label,
  value,
  onChange,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) onChange(Math.max(0, parsed));
          }}
          className="tnum h-11 pr-7 text-right"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          €
        </span>
      </div>
    </div>
  );
}

/**
 * Création d'une stratégie.
 *
 * Volontairement en une seule colonne centrée, à rebours de l'espace de travail
 * en deux colonnes qui la suit : à la création il n'y a encore aucun résultat à
 * regarder, donc rien à mettre en vis-à-vis. Une colonne de lecture, un ordre
 * de lecture, un bouton. Toute la densité arrive après le premier calcul.
 *
 * Deux cartes, dans l'ordre des décisions : le plan — combien, pendant combien
 * de temps — puis les supports. Le reste des réglages (rééquilibrage, frais,
 * fiscalité) est replié : ils ont des valeurs par défaut réalistes, et la
 * majorité des utilisateurs n'y touchera jamais.
 */
export function CreateShell({ catalog }: { catalog: CatalogAsset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const form = useStrategyForm();

  function submit() {
    const parsed = strategyFormSchema.safeParse(form.toPayload());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Formulaire incomplet.");
      return;
    }

    startTransition(async () => {
      const result = await createStrategy(parsed.data);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      router.push(`/strategies/${result.data.id}`);
    });
  }

  const feesSummary = form.values.fees.applyTer
    ? "frais de courtage et frais courants inclus"
    : "frais de courtage inclus";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Composer une stratégie
          </h1>
          <p className="text-sm text-muted-foreground">
            Choisissez vos supports, réglez le plan — le backtest se lance à la
            fin.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-base font-bold">Votre plan</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="strategy-name"
                className="text-xs text-muted-foreground"
              >
                Nom
              </Label>
              <Input
                id="strategy-name"
                value={form.values.name}
                onChange={(event) => form.patch({ name: event.target.value })}
                placeholder="Ex. World + émergents"
                className="h-11"
              />
            </div>

            <AmountField
              id="initial-amount"
              label="Capital initial"
              value={form.values.initialAmount}
              onChange={(initialAmount) => form.patch({ initialAmount })}
              step={500}
            />
            <AmountField
              id="monthly-contribution"
              label="Chaque mois"
              value={form.values.monthlyContribution}
              onChange={(monthlyContribution) =>
                form.patch({ monthlyContribution })
              }
              step={50}
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="years" className="text-xs text-muted-foreground">
                  Durée
                </Label>
                <span className="tnum text-xs">
                  {form.values.years} an{form.values.years > 1 ? "s" : ""}
                </span>
              </div>
              {/* `h-11` aligne le rail sur la hauteur des champs voisins, la
                  poignée elle-même reste à sa taille standard. */}
              <div className="flex h-11 items-center">
                <Slider
                  id="years"
                  min={1}
                  max={30}
                  step={1}
                  value={[form.values.years]}
                  onValueChange={([years]) => form.patch({ years })}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {PERIOD_LABELS[form.values.rebalancing.period]} · {feesSummary} ·{" "}
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2"
            >
              réglages avancés
              {advancedOpen ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </button>
          </p>

          {advancedOpen && (
            <div className="space-y-5 border-t pt-4">
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Rééquilibrage
                </h3>
                <ChoiceField
                  label="Périodicité"
                  value={form.values.rebalancing.period}
                  onChange={(period) =>
                    form.patch({
                      rebalancing: { ...form.values.rebalancing, period },
                    })
                  }
                  options={PERIOD_OPTIONS}
                />
                <ToggleField
                  id="threshold-enabled"
                  label="Sur dérive"
                  hint="Se cumule avec la périodicité"
                  checked={form.values.rebalancing.thresholdEnabled}
                  onChange={(thresholdEnabled) =>
                    form.patch({
                      rebalancing: {
                        ...form.values.rebalancing,
                        thresholdEnabled,
                      },
                    })
                  }
                />
                {form.values.rebalancing.thresholdEnabled && (
                  <MiniField
                    id="threshold-points"
                    label="Écart toléré"
                    value={form.values.rebalancing.thresholdPoints}
                    onChange={(thresholdPoints) =>
                      form.patch({
                        rebalancing: {
                          ...form.values.rebalancing,
                          thresholdPoints,
                        },
                      })
                    }
                    suffix="pts"
                    step={1}
                    min={1}
                    max={50}
                  />
                )}
              </div>

              <div className="space-y-2.5 border-t pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Frais
                </h3>
                <div className="grid max-w-xs grid-cols-2 gap-2">
                  <MiniField
                    id="brokerage-percent"
                    label="Courtage par ordre"
                    value={form.values.fees.brokeragePercent}
                    onChange={(brokeragePercent) =>
                      form.patch({
                        fees: { ...form.values.fees, brokeragePercent },
                      })
                    }
                    suffix="%"
                    step={0.05}
                  />
                  <MiniField
                    id="brokerage-min"
                    label="Minimum par ordre"
                    value={form.values.fees.brokerageMinEur}
                    onChange={(brokerageMinEur) =>
                      form.patch({
                        fees: { ...form.values.fees, brokerageMinEur },
                      })
                    }
                    suffix="€"
                    step={0.5}
                  />
                  <MiniField
                    id="spread-percent"
                    label="Spread"
                    value={form.values.fees.spreadPercent}
                    onChange={(spreadPercent) =>
                      form.patch({
                        fees: { ...form.values.fees, spreadPercent },
                      })
                    }
                    suffix="%"
                    step={0.05}
                  />
                </div>
                <ToggleField
                  id="apply-ter"
                  label="Frais courants (TER)"
                  hint="Prélevés chaque jour sur l'encours"
                  checked={form.values.fees.applyTer}
                  onChange={(applyTer) =>
                    form.patch({ fees: { ...form.values.fees, applyTer } })
                  }
                />
              </div>

              <div className="space-y-2.5 border-t pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Analyse
                </h3>
                <ToggleField
                  id="real-returns"
                  label="Rendement réel"
                  hint="Déflaté de l'inflation"
                  checked={form.values.realReturns}
                  onChange={(realReturns) => form.patch({ realReturns })}
                />
                <ToggleField
                  id="taxation"
                  label="Fiscalité à la sortie"
                  hint="PEA contre compte-titres"
                  checked={form.values.taxation}
                  onChange={(taxation) => form.patch({ taxation })}
                />
                <ChoiceField
                  label="Référence"
                  value={form.values.benchmark ?? "__none__"}
                  onChange={(value) =>
                    form.patch({
                      benchmark: value === "__none__" ? null : value,
                    })
                  }
                  options={BENCHMARK_OPTIONS}
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border bg-card p-5">
          {/* La recherche d'abord, les allocations types ensuite : ouvrir sur
              une dizaine de cartes de propositions repoussait le champ de
              recherche sous la ligne de flottaison, et laissait croire qu'il
              fallait choisir un modèle pour commencer. */}
          <AssetPicker form={form} catalog={catalog} title="Vos supports" />

          {form.assets.length === 0 && (
            <div className="border-t pt-4">
              <PresetPicker
                catalog={catalog}
                onApply={(presetAssets, presetName) => {
                  form.setAssets(presetAssets);
                  // Le nom n'est proposé que si le champ est encore vide :
                  // écraser un nom déjà choisi serait hostile.
                  form.setValues((current) =>
                    current.name.trim() === ""
                      ? { ...current, name: presetName }
                      : current,
                  );
                }}
              />
            </div>
          )}

          {/* La répartition en anneau reste consultable, mais discrète : à deux
              lignes les poids saisis la disent déjà, et elle ne prend son sens
              qu'à partir de quatre ou cinq supports. */}
          {form.assets.length > 0 && (
            <div className="flex justify-center pt-1">
              <AllocationDonut assets={form.assets} size={120} />
            </div>
          )}
        </section>

        <div className="flex flex-col items-end gap-2">
          <Button
            size="lg"
            disabled={!form.complete || pending}
            onClick={submit}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Voir ce que ça aurait donné
          </Button>
          {form.assets.length > 0 && !form.weightsValid && (
            <p className="text-xs text-[var(--neg-text)]">
              La somme des poids doit valoir 100 %
            </p>
          )}
          {form.assets.length > 0 &&
            form.weightsValid &&
            !form.hasContribution && (
              <p className="text-xs text-[var(--neg-text)]">
                Renseignez un capital initial ou un versement mensuel
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
