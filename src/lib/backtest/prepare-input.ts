import { inArray } from "drizzle-orm";

import {
  ensureAssetPrices,
  ensureFxSeries,
  loadFxSeries,
  loadPriceSeries,
} from "@/lib/data-fetching/cache-orchestrator";
import { getInflationSeries } from "@/lib/data-fetching/inflation/loader";
import { db } from "@/lib/db";
import { assets as assetsTable, type Asset } from "@/lib/db/schema";
import type {
  AssetInput,
  BenchmarkInput,
  EngineInput,
  FxPoint,
  IsoDate,
  StrategyParams,
} from "@/lib/engine/types";

/**
 * Assemble l'entrée du moteur à partir de la base.
 *
 * C'est la seule couche qui touche à la fois la persistance et le moteur. Le
 * moteur reste pur ; tout ce qui est réseau, cache et requête vit ici.
 */

export interface StrategyAssetSelection {
  assetId: string;
  /** Poids cible en fraction. */
  targetWeight: number;
}

export interface PreparedInput {
  input: EngineInput;
  /** Incidents non bloquants rencontrés à la récupération des données. */
  warnings: string[];
  /** Actifs du catalogue, pour l'affichage (libellés, couleurs, éligibilité). */
  catalog: Map<string, Asset>;
}

/**
 * Fenêtre imposée au moteur, en remplacement de celle qu'il déduirait de la
 * durée demandée. La comparaison s'en sert pour rejouer tous les éléments sur
 * la période commune.
 */
export interface EngineWindow {
  startDate?: IsoDate;
  endDate?: IsoDate;
}

/** Longueur maximale d'une chaîne de relais.
 *
 *  Un garde-fou, pas un réglage : deux relais suffisent aux cas connus, et une
 *  borne évite qu'une donnée mal saisie — un actif se référençant lui-même,
 *  deux actifs se pointant l'un l'autre — ne fasse tourner la résolution
 *  indéfiniment. Le jeu d'identifiants déjà vus attrape le cycle ; cette borne
 *  attrape ce qu'il ne verrait pas. */
const MAX_PROXY_DEPTH = 4;

/**
 * Déroule la chaîne de relais de chaque actif, du plus proche au plus ancien.
 *
 * Chargée en une requête par niveau plutôt qu'une par actif : les chaînes sont
 * courtes et se recoupent largement — quatre ETF émergents partagent le même
 * premier relais.
 */
async function resolveProxyChains(
  primary: readonly Asset[],
): Promise<Map<string, Asset[]>> {
  const chains = new Map<string, Asset[]>(primary.map((a) => [a.id, []]));
  const known = new Map<string, Asset>(primary.map((a) => [a.id, a]));

  /** Actifs dont il reste à résoudre le relais, par actif d'origine. */
  let frontier = primary
    .filter((a) => a.proxyAssetId !== null)
    .map((a) => ({ rootId: a.id, nextId: a.proxyAssetId!, seen: new Set([a.id]) }));

  for (let depth = 0; depth < MAX_PROXY_DEPTH && frontier.length > 0; depth += 1) {
    const missing = frontier
      .map((f) => f.nextId)
      .filter((id) => !known.has(id));

    if (missing.length > 0) {
      const rows = await db
        .select()
        .from(assetsTable)
        .where(inArray(assetsTable.id, [...new Set(missing)]));
      for (const row of rows) known.set(row.id, row);
    }

    const next: typeof frontier = [];
    for (const step of frontier) {
      const asset = known.get(step.nextId);
      // Un maillon absent interrompt la chaîne sans la casser : les relais
      // déjà résolus restent utilisables.
      if (!asset || step.seen.has(asset.id)) continue;

      chains.get(step.rootId)!.push(asset);

      if (asset.proxyAssetId) {
        next.push({
          rootId: step.rootId,
          nextId: asset.proxyAssetId,
          seen: new Set(step.seen).add(asset.id),
        });
      }
    }
    frontier = next;
  }

  return chains;
}

export async function prepareEngineInput(options: {
  selection: readonly StrategyAssetSelection[];
  params: StrategyParams;
  benchmarkTicker?: string | null;
  window?: EngineWindow | null;
}): Promise<PreparedInput> {
  const { selection, params } = options;
  const warnings: string[] = [];

  if (selection.length === 0) {
    throw new Error("Aucun actif sélectionné.");
  }

  // --- Catalogue, proxys et benchmark ---------------------------------------

  const selectedIds = selection.map((s) => s.assetId);
  const primary = await db
    .select()
    .from(assetsTable)
    .where(inArray(assetsTable.id, selectedIds));

  // Un proxy peut lui-même en avoir un : les relais se suivent, du substitut le
  // plus fidèle au plus ancien. On déroule donc la chaîne au lieu de s'arrêter
  // au premier maillon.
  const chains = await resolveProxyChains(primary);
  const proxies = [...new Map(
    [...chains.values()].flat().map((asset) => [asset.id, asset]),
  ).values()];

  const benchmark = options.benchmarkTicker
    ? ((
        await db
          .select()
          .from(assetsTable)
          .where(inArray(assetsTable.tickerYahoo, [options.benchmarkTicker]))
      )[0] ?? null)
    : null;

  const catalog = new Map<string, Asset>();
  for (const asset of [...primary, ...proxies, ...(benchmark ? [benchmark] : [])]) {
    catalog.set(asset.id, asset);
  }

  // --- Hydratation du cache -------------------------------------------------

  // Le proxy n'est chargé que s'il va réellement servir : télécharger trente ans
  // d'historique d'un indice pour un utilisateur qui a choisi de démarrer plus
  // tard serait du gaspillage pur.
  const needProxies = params.youngAssetResolution === "use-proxy";

  const toHydrate = [
    ...primary,
    ...(needProxies ? proxies : []),
    ...(benchmark ? [benchmark] : []),
  ];

  for (const asset of toHydrate) {
    const outcome = await ensureAssetPrices(asset.id, asset.tickerYahoo);
    if (outcome.warning) warnings.push(outcome.warning);
  }

  const currencies = new Set(
    toHydrate.map((a) => a.currency).filter((c) => c !== "EUR"),
  );

  const fx: Record<string, FxPoint[]> = {};
  for (const currency of currencies) {
    const outcome = await ensureFxSeries(currency);
    if (outcome.warning) warnings.push(outcome.warning);
    fx[currency] = await loadFxSeries(currency);
  }

  // --- Construction de l'entrée ---------------------------------------------

  const byId = new Map(primary.map((a) => [a.id, a]));
  const engineAssets: AssetInput[] = [];

  for (const { assetId, targetWeight } of selection) {
    const asset = byId.get(assetId);
    if (!asset) {
      throw new Error(`Actif ${assetId} introuvable dans le catalogue.`);
    }

    const chain = needProxies ? (chains.get(asset.id) ?? []) : [];
    const proxySeries = await Promise.all(
      chain.map(async (proxy) => ({
        currency: proxy.currency,
        prices: await loadPriceSeries(
          proxy.id,
          proxy.priceHistoryFrom ?? undefined,
        ),
      })),
    );

    engineAssets.push({
      id: asset.id,
      ticker: asset.tickerYahoo,
      label: asset.shortLabel,
      ter: asset.ter === null ? null : Number(asset.ter),
      currency: asset.currency,
      targetWeight,
      peaEligible: asset.peaEligible,
      // `priceHistoryFrom` écarte les cotations connues comme fausses. Écarter
      // plutôt que corriger : l'actif se comporte alors exactement comme un
      // actif jeune, et son proxy couvre la période, ce que l'interface sait
      // déjà expliquer.
      prices: await loadPriceSeries(
        asset.id,
        asset.priceHistoryFrom ?? undefined,
      ),
      proxies: proxySeries,
      hasProxyAvailable: asset.proxyAssetId !== null,
      inceptionDate: asset.inceptionDate ?? undefined,
    });
  }

  const benchmarkInput: BenchmarkInput | null = benchmark
    ? {
        id: benchmark.id,
        ticker: benchmark.tickerYahoo,
        label: benchmark.shortLabel,
        currency: benchmark.currency,
        prices: await loadPriceSeries(
          benchmark.id,
          benchmark.priceHistoryFrom ?? undefined,
        ),
      }
    : null;

  // L'inflation n'est chargée que si le rendement réel est demandé : la série
  // est légère, mais la passer systématiquement laisserait croire qu'elle
  // influe sur des calculs où elle n'intervient pas.
  const inflation = params.realReturns ? getInflationSeries("FR") : undefined;

  return {
    input: {
      params,
      assets: engineAssets,
      benchmark: benchmarkInput,
      fx,
      inflation,
      startDate: options.window?.startDate,
      endDate: options.window?.endDate,
    },
    warnings,
    catalog,
  };
}
