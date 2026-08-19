"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { createStrategy } from "@/actions/strategies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { strategyFormSchema } from "@/lib/validation/strategy.schema";
import { AllocationDonut } from "./allocation-donut";
import { AssetPicker } from "./asset-picker";
import { PresetPicker } from "./preset-picker";
import { SidebarParams } from "./sidebar-params";
import { useStrategyForm } from "./use-strategy-form";

/**
 * Création d'une stratégie.
 *
 * Volontairement en une seule colonne centrée, à rebours de l'espace de travail
 * en trois colonnes qui la suit : à la création il n'y a encore aucun résultat à
 * regarder, donc rien à mettre en vis-à-vis. Une colonne de lecture, un ordre de
 * lecture, un bouton. Toute la densité arrive après le premier calcul.
 */
export function CreateShell({ catalog }: { catalog: CatalogAsset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 lg:py-8">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Nouvelle stratégie
          </h1>
          <p className="text-sm text-muted-foreground">
            Composez une allocation, réglez le plan d&apos;investissement, et
            lancez le backtest. Tout reste modifiable ensuite.
          </p>
        </header>

        <section className="space-y-1.5">
          <Label htmlFor="strategy-name">Nom de la stratégie</Label>
          <Input
            id="strategy-name"
            value={form.values.name}
            onChange={(event) => form.patch({ name: event.target.value })}
            placeholder="Ex. World + émergents"
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Allocation</h2>
            <p className="text-xs text-muted-foreground">
              Les poids cibles doivent sommer à 100 %.
            </p>
          </div>

          {form.assets.length === 0 && (
            <PresetPicker
              catalog={catalog}
              onApply={(presetAssets, presetName) => {
                form.setAssets(presetAssets);
                // Le nom n'est proposé que si le champ est encore vide : écraser
                // un nom déjà choisi serait hostile.
                form.setValues((current) =>
                  current.name.trim() === ""
                    ? { ...current, name: presetName }
                    : current,
                );
              }}
            />
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <AssetPicker form={form} catalog={catalog} />
            </div>
            {form.assets.length > 0 && (
              <div className="flex justify-center sm:pt-1">
                <AllocationDonut assets={form.assets} />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Paramètres</h2>
          <SidebarParams
            values={form.values}
            onChange={form.patch}
            includeName={false}
          />
        </section>

        <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <Button
            className="w-full"
            size="lg"
            disabled={!form.complete || pending}
            onClick={submit}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Créer et lancer le backtest
          </Button>
          {form.assets.length > 0 && !form.weightsValid && (
            <p className="mt-2 text-center text-xs text-[var(--neg-text)]">
              La somme des poids doit valoir 100 %
            </p>
          )}
          {form.assets.length > 0 &&
            form.weightsValid &&
            !form.hasContribution && (
              <p className="mt-2 text-center text-xs text-[var(--neg-text)]">
                Renseignez un capital initial ou un versement mensuel
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
