"use client";

import { Loader2, PanelLeft, Scale, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { addFallbackAsset } from "@/actions/assets";
import { createStrategy, updateStrategy } from "@/actions/strategies";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildAssetPalette } from "@/lib/utils/asset-palette";
import { formatPercent } from "@/lib/utils/format";
import {
  DEFAULT_STRATEGY_FORM,
  strategyFormSchema,
  type StrategyFormValues,
} from "@/lib/validation/strategy.schema";
import { AllocationDonut } from "./allocation-donut";
import { AssetRow } from "./asset-row";
import { AssetSearchBar } from "./asset-search-bar";
import { PeaVerdictBadge } from "./pea-badge";
import { SidebarParams } from "./sidebar-params";
import {
  equalWeights,
  peaVerdictFor,
  totalWeight,
  weightedTer,
  type EditorAsset,
} from "./types";

/**
 * Éditeur de stratégie.
 *
 * Contrainte structurante : l'écran ne défile pas. La grille fixe une colonne
 * de paramètres et une zone d'allocation, chacune gérant son propre
 * défilement interne si son contenu déborde — c'est ce qui permet d'ajouter
 * quinze actifs sans jamais perdre de vue le bouton de lancement ni le total
 * des poids.
 *
 * Sur mobile, la colonne devient un tiroir : les mêmes composants de champ y
 * sont réutilisés, il n'existe pas de seconde version du formulaire.
 */
export function EditorShell({
  initialValues,
  initialAssets,
  strategyId,
}: {
  initialValues?: StrategyFormValues;
  initialAssets?: EditorAsset[];
  /** Renseigné en mode édition : la stratégie est mise à jour au lieu d'être créée. */
  strategyId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [values, setValues] = useState<StrategyFormValues>(
    initialValues ?? DEFAULT_STRATEGY_FORM,
  );
  const [assets, setAssets] = useState<EditorAsset[]>(initialAssets ?? []);

  const palette = useMemo(
    () => buildAssetPalette(assets.map((a) => a.assetId)),
    [assets],
  );

  const total = totalWeight(assets);
  const weightsValid = Math.abs(total - 100) < 0.01;
  const canSubmit =
    weightsValid && assets.length > 0 && values.name.trim().length > 0;

  const patch = (update: Partial<StrategyFormValues>) =>
    setValues((current) => ({ ...current, ...update }));

  function addAsset(asset: EditorAsset) {
    setAssets((current) => {
      if (current.some((a) => a.assetId === asset.assetId)) return current;

      const next = [...current, asset];
      // Premier actif ajouté : lui donner 100 % évite un formulaire invalide
      // dès la première action. Au-delà, on répartit également, ce qui est le
      // point de départ le plus courant et reste modifiable.
      return equalWeights(next);
    });
  }

  async function addFromYahoo(symbol: string, name: string) {
    const result = await addFallbackAsset({ symbol, name });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    addAsset({
      assetId: result.data.assetId,
      tickerYahoo: symbol,
      shortLabel: name.length > 40 ? `${name.slice(0, 38)}…` : name,
      type: "stock",
      peaEligible: null,
      ter: null,
      currency: "EUR",
      dataPartial: true,
      weightPercent: 0,
    });
  }

  function submit() {
    const payload: StrategyFormValues = {
      ...values,
      assets: assets.map((asset) => ({
        assetId: asset.assetId,
        weightPercent: asset.weightPercent,
      })),
    };

    const parsed = strategyFormSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Formulaire incomplet.");
      return;
    }

    startTransition(async () => {
      const result = strategyId
        ? await updateStrategy(strategyId, parsed.data)
        : await createStrategy(parsed.data);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      router.push(`/strategies/${result.data.id}`);
    });
  }

  const sidebar = <SidebarParams values={values} onChange={patch} />;

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr]">
      {/* Colonne de paramètres — masquée sous lg, disponible en tiroir. */}
      <aside className="hidden min-h-0 flex-col border-r lg:flex">
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">{sidebar}</div>
        </ScrollArea>
        <div className="border-t p-3">
          <Button
            className="w-full"
            disabled={!canSubmit || pending}
            onClick={submit}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Lancer le backtest
          </Button>
          {!weightsValid && assets.length > 0 && (
            <p className="mt-2 text-center text-[11px] text-[var(--neg-text)]">
              La somme des poids doit valoir 100 %
            </p>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b p-3 lg:p-4">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden">
                <PanelLeft className="size-4" />
                <span className="sr-only">Paramètres de la stratégie</span>
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Paramètres</DrawerTitle>
              </DrawerHeader>
              <ScrollArea className="max-h-[70dvh]">
                <div className="p-4">{sidebar}</div>
              </ScrollArea>
            </DrawerContent>
          </Drawer>

          <div className="min-w-0 flex-1">
            <AssetSearchBar
              selectedIds={assets.map((a) => a.assetId)}
              onAdd={addAsset}
              onAddFromYahoo={addFromYahoo}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row lg:p-4">
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Allocation
              </h2>
              {assets.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setAssets((current) => equalWeights(current))}
                >
                  <Scale className="size-3" />
                  Répartir également
                </Button>
              )}
            </div>

            {assets.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
                <Wallet className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Ajoutez des actifs avec la barre de recherche.
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Essayez « world », « cw8 » ou un code ISIN.
                </p>
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1.5 pr-3">
                  {assets.map((asset) => (
                    <AssetRow
                      key={asset.assetId}
                      asset={asset}
                      color={palette.get(asset.assetId)!}
                      onWeightChange={(weightPercent) =>
                        setAssets((current) =>
                          current.map((a) =>
                            a.assetId === asset.assetId
                              ? { ...a, weightPercent }
                              : a,
                          ),
                        )
                      }
                      onRemove={() =>
                        setAssets((current) =>
                          current.filter((a) => a.assetId !== asset.assetId),
                        )
                      }
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <aside className="flex shrink-0 flex-row items-center gap-4 rounded-lg border p-4 lg:w-[220px] lg:flex-col lg:items-stretch">
            <div className="flex justify-center">
              <AllocationDonut assets={assets} />
            </div>

            <dl className="flex-1 space-y-1.5 text-xs lg:flex-none">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Total des poids</dt>
                <dd
                  className={`tnum font-medium ${
                    weightsValid ? "" : "text-[var(--neg-text)]"
                  }`}
                >
                  {total.toLocaleString("fr-FR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  %
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Frais pondérés</dt>
                <dd className="tnum font-medium">
                  {formatPercent(weightedTer(assets))}
                </dd>
              </div>
            </dl>

            <div className="flex justify-center lg:justify-stretch">
              <PeaVerdictBadge verdict={peaVerdictFor(assets)} />
            </div>

            {/* Le bouton de la colonne latérale est masqué sous lg : on le
                réexpose ici pour que l'action reste atteignable sur mobile. */}
            <Button
              className="lg:hidden"
              disabled={!canSubmit || pending}
              onClick={submit}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Lancer
            </Button>
          </aside>
        </div>
      </section>
    </div>
  );
}
