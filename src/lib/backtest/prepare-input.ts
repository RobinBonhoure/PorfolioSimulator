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

  const proxyIds = primary
    .map((a) => a.proxyAssetId)
    .filter((id): id is string => id !== null);

  const proxies = proxyIds.length
    ? await db
        .select()
        .from(assetsTable)
        .where(inArray(assetsTable.id, proxyIds))
    : [];

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
  const proxyById = new Map(proxies.map((a) => [a.id, a]));

  const engineAssets: AssetInput[] = [];

  for (const { assetId, targetWeight } of selection) {
    const asset = byId.get(assetId);
    if (!asset) {
      throw new Error(`Actif ${assetId} introuvable dans le catalogue.`);
    }

    const proxy =
      needProxies && asset.proxyAssetId
        ? proxyById.get(asset.proxyAssetId)
        : undefined;

    engineAssets.push({
      id: asset.id,
      ticker: asset.tickerYahoo,
      label: asset.shortLabel,
      ter: asset.ter === null ? null : Number(asset.ter),
      currency: asset.currency,
      targetWeight,
      peaEligible: asset.peaEligible,
      prices: await loadPriceSeries(asset.id),
      proxyPrices: proxy ? await loadPriceSeries(proxy.id) : undefined,
      proxyCurrency: proxy?.currency,
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
        prices: await loadPriceSeries(benchmark.id),
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
