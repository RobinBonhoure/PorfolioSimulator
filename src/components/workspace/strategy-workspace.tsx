"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, PanelLeft, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { duplicateStrategy, updateStrategy } from "@/actions/strategies";
import { YoungAssetDialog } from "@/components/results/young-asset-dialog";
import { AssetPicker } from "@/components/strategy-editor/asset-picker";
import { SidebarParams } from "@/components/strategy-editor/sidebar-params";
import type { EditorAsset } from "@/components/strategy-editor/types";
import { useStrategyForm } from "@/components/strategy-editor/use-strategy-form";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBacktest } from "@/hooks/use-backtest";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import type { YoungAssetResolution } from "@/lib/engine/types";
import {
  strategyFormSchema,
  type StrategyFormValues,
} from "@/lib/validation/strategy.schema";
import { toEngineParams, toSelection } from "@/lib/validation/to-engine-params";
import { ResultsCenter, ResultsCenterSkeleton } from "./results-center";

/** Délai avant recalcul, en millisecondes. Assez long pour absorber la saisie
 *  d'un montant chiffre par chiffre, assez court pour que déplacer un curseur
 *  donne l'impression d'agir sur la courbe. */
const RECOMPUTE_DELAY_MS = 600;

/** Marqueur d'allocation incomplète : les poids ne somment pas à 100 %, ou il
 *  n'y a plus d'actif. On ne calcule rien, et on garde à l'écran le dernier
 *  résultat valable plutôt que de revenir à la stratégie enregistrée — ce qui
 *  ferait clignoter des chiffres sans rapport avec ce qu'on est en train de
 *  saisir. */
const INCOMPLETE = "__brouillon-incomplet__";

/** Empreinte d'un état de formulaire, pour détecter les modifications. */
function snapshot(values: StrategyFormValues, assets: EditorAsset[]): string {
  return JSON.stringify({
    values: { ...values, assets: undefined },
    assets: assets.map((a) => [a.assetId, a.weightPercent]),
  });
}

/**
 * Espace de travail d'une stratégie.
 *
 * Paramètres à gauche, résultats au centre, synthèse à droite : tout est
 * simultanément visible, et modifier un paramètre relance le calcul sans quitter
 * l'écran. Le recalcul ne touche jamais la base — la stratégie enregistrée ne
 * change qu'au clic sur « Enregistrer ». C'est ce qui permet d'essayer une
 * variante et de l'abandonner.
 */
export function StrategyWorkspace({
  strategyId,
  initialValues,
  initialAssets,
  catalog,
  savedResolution,
}: {
  strategyId: string;
  initialValues: StrategyFormValues;
  initialAssets: EditorAsset[];
  catalog: CatalogAsset[];
  savedResolution: YoungAssetResolution | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saving, startSave] = useTransition();
  const [duplicating, startDuplicate] = useTransition();

  const form = useStrategyForm(initialValues, initialAssets);
  const [resolution, setResolution] = useState(savedResolution);
  const [savedKey, setSavedKey] = useState(() =>
    snapshot(initialValues, initialAssets),
  );

  const currentKey = snapshot(form.values, form.assets);
  const isDirty = currentKey !== savedKey;

  // Sérialisé dès ici : la clé de requête doit être comparable par identité,
  // et un objet reconstruit à chaque rendu relancerait le calcul en boucle.
  const draftJson = useMemo(() => {
    if (!isDirty) return null;
    if (!form.weightsValid || form.assets.length === 0 || !form.hasContribution) {
      return INCOMPLETE;
    }

    const payload = form.toPayload();
    return JSON.stringify({
      params: toEngineParams(payload, resolution),
      selection: toSelection(payload),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, currentKey, resolution, form.weightsValid, form.hasContribution]);

  const debouncedDraft = useDebouncedValue(draftJson, RECOMPUTE_DELAY_MS);

  // Pourquoi le recalcul ne part pas, le cas échéant. Le message vivait
  // jusqu'ici sous le bouton d'enregistrement, en bas de la colonne de gauche :
  // retirer un actif figeait donc les résultats en silence pour qui regardait
  // le centre de l'écran, et laissait croire à une panne.
  const blockedReason = !isDirty
    ? null
    : form.assets.length === 0
      ? "Ajoutez au moins un actif pour relancer le calcul."
      : !form.weightsValid
        ? `La somme des poids vaut ${form.total.toLocaleString("fr-FR", {
            maximumFractionDigits: 2,
          })} % : ramenez-la à 100 % pour relancer le calcul.`
        : !form.hasContribution
          ? "Renseignez un capital initial ou un versement mensuel pour relancer le calcul."
          : null;

  // Retenue du dernier brouillon calculable, en ajustant l'état pendant le
  // rendu plutôt que dans un effet : la requête part avec la bonne clé au
  // premier rendu, sans passer par un aller-retour d'affichage.
  const [seenDraft, setSeenDraft] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<string | null>(null);
  if (debouncedDraft !== seenDraft) {
    setSeenDraft(debouncedDraft);
    if (debouncedDraft !== INCOMPLETE) setActiveDraft(debouncedDraft);
  }

  const { data, isPending, isFetching, error } = useBacktest(
    strategyId,
    resolution,
    activeDraft,
  );

  const needsResolution =
    resolution === null && (data?.result.youngAssets.length ?? 0) > 0;

  function save() {
    const parsed = strategyFormSchema.safeParse(form.toPayload());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Formulaire incomplet.");
      return;
    }

    const keyAtSubmit = currentKey;

    startSave(async () => {
      const result = await updateStrategy(strategyId, parsed.data, resolution);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Le résultat courant devient celui de la stratégie enregistrée. Sans
      // cette réécriture du cache, la requête « sans brouillon » ressortirait
      // avec les métriques d'avant la modification, qu'elle considère encore
      // fraîches.
      if (data) {
        queryClient.setQueryData(["backtest", strategyId, resolution, null], {
          ...data,
          isDraft: false,
        });
      }

      setSavedKey(keyAtSubmit);
      toast.success("Stratégie enregistrée.");
      router.refresh();
    });
  }

  const params = (
    <div className="space-y-5">
      <SidebarParams values={form.values} onChange={form.patch} />
      <section className="space-y-2 border-t pt-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Actifs
        </h2>
        <AssetPicker form={form} catalog={catalog} stacked />
      </section>
    </div>
  );

  const saveBar = (
    <div className="border-t p-3">
      <Button
        className="w-full"
        variant={isDirty ? "default" : "outline"}
        disabled={!isDirty || !form.complete || saving}
        onClick={save}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isDirty ? null : (
          <Check className="size-4" />
        )}
        {isDirty ? "Enregistrer les modifications" : "Aucune modification"}
      </Button>
      {isDirty && !form.weightsValid && (
        <p className="mt-2 text-center text-[11px] text-[var(--neg-text)]">
          La somme des poids doit valoir 100 %
        </p>
      )}
      {isDirty && form.weightsValid && !form.hasContribution && (
        <p className="mt-2 text-center text-[11px] text-[var(--neg-text)]">
          Renseignez un capital initial ou un versement mensuel
        </p>
      )}
      {isDirty && form.complete && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Les résultats affichés portent sur ces modifications ; la stratégie
          enregistrée, elle, n&apos;a pas changé.
        </p>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden lg:p-4 2xl:grid-cols-[380px_minmax(0,1fr)]">
      {data && (
        <YoungAssetDialog
          open={needsResolution}
          youngAssets={data.result.youngAssets}
          requestedYears={Math.round(data.result.metrics.effectiveYears)}
          effectiveStartDate={data.result.metrics.startDate}
          onResolve={setResolution}
        />
      )}

      {/* Colonne de paramètres — en tiroir sous lg. */}
      <aside className="hidden lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-card">
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">{params}</div>
        </ScrollArea>
        {saveBar}
      </aside>

      <section className="flex flex-col lg:min-h-0 lg:overflow-hidden">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-3 py-2 lg:static lg:border-0 lg:bg-transparent lg:px-2 lg:pt-0">
            <div className="flex min-w-0 items-center gap-2">
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
                  <ScrollArea className="max-h-[65dvh]">
                    <div className="p-4">{params}</div>
                  </ScrollArea>
                  {saveBar}
                </DrawerContent>
              </Drawer>

              <h1 className="truncate text-sm font-semibold tracking-tight">
                {form.values.name || "Stratégie sans nom"}
              </h1>

              {isDirty && (
                <span className="shrink-0 rounded-full border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 px-2 py-0.5 text-[11px] text-[var(--score-3)]">
                  Non enregistré
                </span>
              )}
              {isFetching && !isPending && (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={duplicating}
              onClick={() =>
                startDuplicate(async () => {
                  const copy = await duplicateStrategy(strategyId);
                  if (!copy.ok) {
                    toast.error(copy.error);
                    return;
                  }
                  router.push(`/strategies/${copy.data.id}`);
                })
              }
            >
              {duplicating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Copy className="size-3.5" />
              )}
              Dupliquer
            </Button>
          </div>

          {blockedReason && (
            <div className="flex items-start gap-2 border-b border-[var(--score-3)]/40 bg-[var(--score-3)]/10 px-3 py-2 text-xs lg:rounded-lg lg:border lg:px-4">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--score-3)]" />
              <p>
                <span className="font-medium">
                  Les chiffres ci-dessous ne tiennent pas compte de votre
                  dernière modification.
                </span>{" "}
                {blockedReason}
              </p>
            </div>
          )}

          <div className="relative lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {error ? (
              <div className="mx-auto mt-8 flex max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
                <TriangleAlert className="size-5 text-[var(--neg-text)]" />
                <p className="font-medium">Le backtest n&apos;a pas abouti</p>
                <p className="text-sm text-muted-foreground">{error.message}</p>
                <p className="text-xs text-muted-foreground">
                  Ajustez les paramètres à gauche : le calcul repart tout seul.
                </p>
              </div>
            ) : isPending || !data ? (
              <ResultsCenterSkeleton />
            ) : (
              <div className={isFetching ? "opacity-60 transition-opacity" : undefined}>
                <ResultsCenter data={data} />
              </div>
            )}
          </div>
      </section>
    </div>
  );
}
