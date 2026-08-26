"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Check,
  Columns3,
  Loader2,
  PanelLeft,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { rememberComparison } from "@/actions/comparisons";

import { BreakdownDonut } from "@/components/charts/breakdown-donut";
import { ExpertDetails } from "@/components/common/expert-details";
import { SidebarParams } from "@/components/strategy-editor/sidebar-params";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComparisonResult } from "@/lib/backtest/compare";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import type { StrategyListItem } from "@/lib/db/queries/strategies";
import type { StrategyParams } from "@/lib/engine/types";
import { colorForIndex } from "@/lib/utils/asset-palette";
import { formatDate } from "@/lib/utils/format";
import { displayedMetrics, isRealMode } from "@/lib/backtest/displayed-metrics";
import { CompareDrawdownChart, CompareValueChart } from "./compare-charts";
import { CompareRanking } from "./compare-ranking";
import {
  ComparePicker,
  MAX_ITEMS,
  MIN_ITEMS,
  selectionSize,
  type CompareSelection,
} from "./compare-picker";
import { CompareTable } from "./compare-table";
import {
  DEFAULT_STRATEGY_FORM,
  type StrategyFormValues,
} from "@/lib/validation/strategy.schema";
import {
  fromEngineParams,
  toEngineParams,
} from "@/lib/validation/to-engine-params";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-heading text-base font-bold">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Sélection et plan tels qu'effectivement calculés. */
type AppliedComparison = CompareSelection & { params: StrategyParams };

/** Adresse partageable correspondant à une sélection. */
function urlFor(selection: CompareSelection): string {
  const params = new URLSearchParams();
  if (selection.strategyIds.length > 0) {
    params.set("ids", selection.strategyIds.join(","));
  }
  if (selection.assetIds.length > 0) {
    params.set("assets", selection.assetIds.join(","));
  }
  const query = params.toString();
  return query ? `/compare?${query}` : "/compare";
}

/**
 * Écran de comparaison.
 *
 * La sélection et le plan restent en permanence dans la colonne de gauche, les
 * résultats occupent le reste. Contrairement à l'éditeur de stratégie, rien ne
 * se recalcule tant qu'on n'a pas validé : une comparaison mobilise jusqu'à
 * quatre backtests complets, et les relancer à chaque frappe dans un champ de
 * montant coûterait cher pour un état intermédiaire dont personne ne veut.
 *
 * D'où deux états distincts : le **brouillon**, qu'on modifie librement, et
 * l'**appliqué**, seul à déclencher un calcul. Le bouton du bas fait passer de
 * l'un à l'autre, et mémorise au passage la comparaison à restaurer.
 *
 * L'URL est mise à jour par `history.replaceState` plutôt que par le routeur :
 * la comparaison reste partageable par copie du lien, sans re-rendre la page ni
 * empiler une entrée d'historique.
 */
export function CompareView({
  initial,
  initialParams,
  strategies,
  catalog,
  chosenAssets,
}: {
  initial: CompareSelection;
  /** Plan restauré de la dernière comparaison, ou `null` pour repartir des
   *  valeurs par défaut. */
  initialParams: StrategyParams | null;
  strategies: StrategyListItem[];
  catalog: CatalogAsset[];
  /** Supports de la sélection restaurée, catalogue ou non. */
  chosenAssets: CatalogAsset[];
}) {
  const [selection, setSelection] = useState(initial);

  // Le plan est saisi sous la forme du formulaire — pourcentages de frais
  // compris — et n'est converti pour le moteur qu'au moment de l'envoi. C'est
  // la même frontière d'unités que partout ailleurs.
  const initialForm: StrategyFormValues = {
    ...DEFAULT_STRATEGY_FORM,
    name: "comparaison",
    ...(initialParams ? fromEngineParams(initialParams) : {}),
  };

  const [form, setForm] = useState<StrategyFormValues>(initialForm);
  const params = useMemo(() => toEngineParams(form), [form]);

  const [saving, startSave] = useTransition();

  /** Ce qui est réellement calculé. `null` tant que rien n'a été validé. */
  const [applied, setApplied] = useState<AppliedComparison | null>(() =>
    selectionSize(initial) >= MIN_ITEMS
      ? { ...initial, params: toEngineParams(initialForm) }
      : null,
  );

  // Sérialisés pour être comparables par identité. L'empreinte du brouillon et
  // celle de l'appliqué passent par la **même** conversion : l'aller-retour
  // fraction/pourcentage des frais et l'ordre des clés du JSON stocké en base
  // suffiraient sinon à produire deux chaînes différentes pour un état
  // identique, et le bouton resterait allumé en permanence.
  const draftKey = JSON.stringify({ ...selection, params });
  const appliedKey = applied === null ? "" : JSON.stringify(applied);

  const count = selectionSize(selection);
  const complete = count >= MIN_ITEMS;
  const isDirty = draftKey !== appliedKey;

  const { data, isFetching, error } = useQuery<ComparisonResult>({
    queryKey: ["compare", appliedKey],
    enabled: applied !== null,
    retry: false,
    staleTime: 10 * 60 * 1000,
    // Le passage d'une comparaison appliquée à la suivante ne doit pas vider
    // l'écran : on garde les courbes précédentes, estompées, le temps du calcul.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch("/api/compare/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applied),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "La comparaison a échoué.");
      }
      return payload;
    },
  });

  function apply() {
    const next: AppliedComparison = { ...selection, params };
    setApplied(next);

    const url = urlFor(next);
    if (window.location.pathname + window.location.search !== url) {
      window.history.replaceState(null, "", url);
    }

    // Mémorisation dans la foulée : ce qu'on vient de valider est aussi ce
    // qu'on veut retrouver à la prochaine visite.
    startSave(async () => {
      const result = await rememberComparison(next);
      if (!result.ok) toast.error(result.error);
    });
  }

  // Le réglage « rendement réel » du plan porte sur tout l'écran, pas seulement
  // sur la valeur finale : métriques, courbes et classement passent en euros
  // constants ensemble, sinon deux chiffres de même nom se contrediraient d'un
  // bloc à l'autre.
  const realMode = applied?.params.realReturns ?? false;

  const shown = useMemo(() => {
    if (!data) return undefined;
    return {
      ...data,
      items: data.items.map((item) => ({
        ...item,
        metrics: displayedMetrics(
          item.metrics,
          isRealMode(realMode, item.metrics),
        ),
      })),
    };
  }, [data, realMode]);

  // La couleur suit la position dans la sélection, pas le rang dans la réponse :
  // retirer un élément ne doit pas repeindre les survivants.
  const colors = useMemo(
    () =>
      new Map(
        [...(applied?.strategyIds ?? []), ...(applied?.assetIds ?? [])].map(
          (id, index) => [id, colorForIndex(index)],
        ),
      ),
    [applied],
  );

  const sidebar = (
    <div className="space-y-5 p-4">
      {/* Le plan d'abord : il s'applique à tout ce qui suit, et le placer sous
          la liste laisserait croire qu'il ne concerne que le dernier élément
          coché. */}
      <section className="space-y-2">
        <SidebarParams
          values={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          includeName={false}
          includeTaxation={false}
          includeBenchmark={false}
        />
      </section>

      <div className="border-t pt-4">
        <ComparePicker
          strategies={strategies}
          catalog={catalog}
          chosenAssets={chosenAssets}
          selection={selection}
          onChange={setSelection}
        />
      </div>
    </div>
  );

  const applyBar = (
    <div className="border-t p-3">
      <Button
        size="lg"
        className="w-full"
        variant={isDirty && complete ? "default" : "outline"}
        disabled={!isDirty || !complete || saving}
        onClick={apply}
      >
        {saving || (isFetching && !isDirty) ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isDirty ? null : (
          <Check className="size-4" />
        )}
        {!complete
          ? `Choisissez ${MIN_ITEMS} à ${MAX_ITEMS} éléments`
          : !isDirty
            ? "Comparaison à jour"
            : applied === null
              ? "Lancer la comparaison"
              : "Appliquer les changements"}
      </Button>
      {isDirty && complete && applied !== null && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Les résultats affichés ne tiennent pas encore compte de ces
          modifications.
        </p>
      )}
    </div>
  );

  // Mêmes largeurs de colonnes que l'espace de travail d'une stratégie : passer
  // de l'un à l'autre ne doit pas déplacer la colonne de gauche sous le curseur.
  return (
    <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden lg:p-4 xl:grid-cols-[360px_minmax(0,1fr)_300px] 2xl:grid-cols-[380px_minmax(0,1fr)_330px]">
      <aside className="hidden lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-card">
        <div className="border-b px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">Comparer</h1>
          <p className="text-xs text-muted-foreground">
            {count === 0
              ? `Choisissez ${MIN_ITEMS} à ${MAX_ITEMS} éléments`
              : count < MIN_ITEMS
                ? "Encore un, au minimum"
                : `${count} retenus${count >= MAX_ITEMS ? " — maximum atteint" : ""}${isDirty ? " · non appliqués" : ""}`}
          </p>
        </div>
        {/* `relative` n'est pas décoratif : `overflow` ne retient pas un
            descendant en position absolue dont le bloc conteneur est ailleurs.
            Sans lui, les libellés `sr-only` des boutons de retrait — absolus
            par définition — se posaient au bas du document et le rendaient
            défilant sur toute sa hauteur, en plus de chaque colonne. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
        {applyBar}
      </aside>

      {/* Centre et colonne de droite, comme dans l'espace de travail : sous
          1280 px ils partagent un seul défilement, au-delà `contents` les fait
          remonter en colonnes de la grille. */}
      <div className="flex flex-col lg:min-h-0 lg:overflow-y-auto xl:contents">
        {/* `min-h-0` seulement à partir de 1280 px : en dessous, la section est
            empilée au-dessus de la synthèse et doit garder sa hauteur de
            contenu. Autorisée à rétrécir sans rien couper, elle laisserait son
            contenu déborder par-dessus le bloc suivant. */}
        <section className="flex flex-col xl:min-h-0 xl:overflow-hidden">
          <div className="flex items-center gap-2 border-b px-3 py-2 lg:hidden">
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" size="sm">
                  <PanelLeft className="size-4" />
                  Choisir ({count})
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Plan et sélection</DrawerTitle>
                </DrawerHeader>
                <div className="relative max-h-[65dvh] overflow-y-auto">
                  {sidebar}
                </div>
                {applyBar}
              </DrawerContent>
            </Drawer>
            {isFetching && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Le défilement propre au centre n'existe qu'à partir de 1280 px.
              En dessous, la colonne de droite passe sous le centre et les deux
              partagent le défilement du conteneur : deux ascenseurs imbriqués
              couperaient le graphique en deux. */}
          <div className="relative xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <div className="mx-auto max-w-6xl p-4 lg:px-2 lg:py-1">
              <Results
                ready={applied !== null}
                data={shown}
                error={error}
                isFetching={isFetching}
                colors={colors}
                count={count}
              />
            </div>
          </div>
        </section>

        {/* Synthèse, comme la colonne de droite d'une stratégie. Elle suit le
            centre en dessous de 1280 px plutôt que de disparaître : le
            classement est la lecture la plus rapide de l'écran, la masquer sur
            un portable serait retirer l'essentiel à ceux qui ont le moins de
            place. */}
        {shown && (
          <aside className="relative border-t xl:min-h-0 xl:overflow-y-auto xl:rounded-2xl xl:border xl:bg-card">
            <div
              className={
                isFetching ? "opacity-60 transition-opacity" : undefined
              }
            >
              <CompareRanking
                items={shown.items}
                colors={colors}
                realMode={realMode}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Results({
  ready,
  data,
  error,
  isFetching,
  colors,
  count,
}: {
  ready: boolean;
  data: ComparisonResult | undefined;
  error: Error | null;
  isFetching: boolean;
  colors: Map<string, string>;
  count: number;
}) {
  if (!ready) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <Columns3 className="size-5 text-muted-foreground" />
        <p className="font-medium">
          {count >= MIN_ITEMS
            ? "Prêt à comparer"
            : count === 0
              ? "Rien à comparer pour l'instant"
              : "Encore un élément"}
        </p>
        <p className="text-sm text-muted-foreground">
          {count >= MIN_ITEMS
            ? "Validez avec le bouton en bas de la colonne pour lancer le calcul."
            : `Choisissez ${MIN_ITEMS} à ${MAX_ITEMS} éléments dans la colonne de gauche : vos stratégies, des supports du catalogue, ou un mélange des deux.`}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/strategies">Voir mes stratégies</Link>
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <TriangleAlert className="size-5 text-[var(--neg-text)]" />
        <p className="font-medium">La comparaison n&apos;a pas abouti</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <p className="text-xs text-muted-foreground">
          Ajustez la sélection à gauche : le calcul repart tout seul.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const seriesInfo = data.items.map((item) => ({
    id: item.id,
    name: item.name,
    color: colors.get(item.id) ?? colorForIndex(0),
  }));

  return (
    <div
      className={`space-y-4 ${isFetching ? "opacity-60 transition-opacity" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {data.items.length} éléments comparés
        </h2>
        <p className="text-sm text-muted-foreground">
          Période commune du {formatDate(data.commonStart)} au{" "}
          {formatDate(data.commonEnd)}.
        </p>
        {isFetching && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </header>

      {data.truncated.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--score-3)]" />
          <span>
            L&apos;historique de{" "}
            <span className="font-medium">{data.truncated.join(", ")}</span>{" "}
            remonte plus loin, mais la comparaison est ramenée à la période
            couverte par tout le monde : le plan y est rejoué depuis le premier
            jour commun. Comparer des périodes différentes reviendrait à
            comparer des marchés différents.
          </span>
        </p>
      )}

      {data.warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm"
        >
          {warning}
        </p>
      ))}

      <Section
        title="Évolution comparée"
        description="Chaque élément part du capital initial du plan, au premier jour de la période commune."
      >
        <CompareValueChart series={data.series} strategies={seriesInfo} />
      </Section>

      <Section
        title="L'essentiel, côte à côte"
        description="La meilleure valeur de chaque ligne est surlignée et cochée."
      >
        <CompareTable
          strategies={data.items}
          colors={colors}
          variant="essential"
        />
      </Section>

      <ExpertDetails storageKey="compare-expert-details">
        <div className="space-y-4">
          <Section
            title="Tableau comparatif complet"
            description="Survolez le nom d'une métrique pour sa définition."
          >
            <CompareTable strategies={data.items} colors={colors} />
          </Section>

          <Section
            title="Baisses subies"
            description="Écart au dernier sommet, superposé pour tous les éléments."
          >
            <CompareDrawdownChart
              drawdowns={data.drawdowns}
              strategies={seriesInfo}
            />
          </Section>

          <Section
            title="Répartitions"
            description="Décompositions des supports, pondérées par leurs poids cibles."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              {data.items.map((item) => (
                <div key={item.id} className="space-y-4 rounded-xl border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span
                      aria-hidden
                      className="size-2 rounded-sm"
                      style={{ backgroundColor: colors.get(item.id) }}
                    />
                    {item.name}
                  </p>
                  <BreakdownDonut
                    title="Secteurs"
                    slices={item.sectors}
                    emptyLabel="Aucune décomposition sectorielle disponible."
                  />
                  <BreakdownDonut
                    title="Zones géographiques"
                    slices={item.geography}
                    emptyLabel="Aucune décomposition géographique disponible."
                  />
                </div>
              ))}
            </div>
          </Section>
        </div>
      </ExpertDetails>
    </div>
  );
}
