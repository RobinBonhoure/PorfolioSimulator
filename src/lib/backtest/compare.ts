import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { getOwnedStrategyIds } from "@/lib/db/queries/strategies";
import { assets, strategyAssets } from "@/lib/db/schema";
import { BacktestError } from "@/lib/engine/run-backtest";
import type {
  BacktestMetrics,
  BacktestResult,
  IsoDate,
  PortfolioDayPoint,
  StrategyParams,
} from "@/lib/engine/types";
import type { EngineWindow, StrategyAssetSelection } from "./prepare-input";
import { runBacktestPreview } from "./run-preview";
import { INVESTED_KEY } from "./comparison-keys";
import { sectorBreakdown, geoBreakdown, collapseTail } from "./breakdowns";
import type { BreakdownSlice } from "./breakdowns";
import { runBacktestForStrategy, type ResultAssetInfo } from "./run-for-strategy";

/**
 * Comparaison de deux à quatre éléments : stratégies enregistrées et supports
 * du catalogue, librement mélangés.
 *
 * Confronter une allocation à un support isolé est le cas d'usage le plus
 * fréquent — « est-ce que mon portefeuille bat un simple MSCI World ? » — et il
 * ne demande aucun traitement particulier : un support est calculé comme une
 * stratégie à une seule ligne, puis aligné comme les autres.
 *
 * Trois précautions déterminent la validité de l'exercice :
 *
 * 0. **Plan d'investissement commun.** Chaque stratégie porte ses propres
 *    montants, sa propre durée et ses propres frais ; les laisser jouer
 *    reviendrait à comparer des plans d'épargne autant que des allocations. La
 *    valeur finale, le capital investi, le gain et les frais du tableau
 *    n'auraient alors aucune commune mesure. Tous les éléments sont donc
 *    calculés avec les paramètres passés en argument, ceux enregistrés sur la
 *    stratégie étant ignorés le temps de la comparaison.
 *
 * 1. **Période commune.** Une stratégie contenant un ETF né en 2019 ne peut pas
 *    être comparée sur vingt ans à une stratégie d'actions cotées depuis 2000.
 *    On retient l'intersection des périodes et on rejoue tout le monde
 *    dessus — sinon on comparerait des rendements couvrant des marchés
 *    différents, ce qui ne veut rien dire. Rejouer, et non tronquer : un
 *    élément dont l'historique remonte plus loin doit lui aussi partir du
 *    capital initial le premier jour commun.
 *
 * 2. **Départ commun.** Les courbes sont en euros et partent toutes du capital
 *    initial du plan. C'est possible depuis que la comparaison impose ce plan à
 *    tout le monde ; tant que chacun gardait le sien, seule une base 100 était
 *    lisible. Les baisses subies restent, elles, mesurées sur un indice pondéré
 *    par le temps, insensible aux versements.
 */

export interface ComparisonPoint {
  date: IsoDate;
  /** Valeur en euros par identifiant d'élément, plus `invested`. */
  [key: string]: number | string;
}

export interface ComparedItem {
  id: string;
  kind: "strategy" | "asset";
  name: string;
  metrics: BacktestMetrics;
  assets: ResultAssetInfo[];
  sectors: BreakdownSlice[];
  geography: BreakdownSlice[];
}

export interface ComparisonResult {
  items: ComparedItem[];
  /** Courbes de valeur en euros sur la période commune, capital versé compris. */
  series: ComparisonPoint[];
  /** Courbes underwater, en fraction négative. */
  drawdowns: ComparisonPoint[];
  commonStart: IsoDate;
  commonEnd: IsoDate;
  /** Éléments dont la période propre était plus longue que la commune. */
  truncated: string[];
  warnings: string[];
}

const MIN_ITEMS = 2;
const MAX_ITEMS = 4;

/**
 * L'historique est complété par proxy, quel que soit l'arbitrage enregistré sur
 * les stratégies : sans cela, ajouter un support coté depuis 2024 ramènerait
 * toute la comparaison à deux ans, y compris pour les stratégies remontant à
 * 2009. C'est un choix de la comparaison, pas de la stratégie.
 */
const COMPARISON_RESOLUTION = "use-proxy" as const;

/** Points transmis au navigateur pour les courbes superposées. */
const MAX_CHART_POINTS = 1_200;

/** Indices régulièrement espacés, bornes comprises. */
function sampleIndices(length: number): number[] {
  if (length <= MAX_CHART_POINTS) {
    return Array.from({ length }, (_, i) => i);
  }

  const stride = (length - 1) / (MAX_CHART_POINTS - 1);
  const kept = new Set<number>([0, length - 1]);
  for (let i = 0; i < MAX_CHART_POINTS; i += 1) {
    kept.add(Math.round(i * stride));
  }

  return [...kept].sort((a, b) => a - b);
}

export interface ComparisonRequest {
  strategyIds: readonly string[];
  assetIds: readonly string[];
  /** Plan appliqué à tous les éléments, sans exception. */
  params: StrategyParams;
}

/** Un élément calculé, ramené à la forme dont la suite a besoin. */
interface ComparisonRun {
  id: string;
  kind: "strategy" | "asset";
  name: string;
  result: BacktestResult;
  assets: ResultAssetInfo[];
  warnings: string[];
}

export async function compareItems(
  request: ComparisonRequest,
  userId: string,
): Promise<ComparisonResult> {
  const strategyIds = [...new Set(request.strategyIds)];
  const assetIds = [...new Set(request.assetIds)];
  const total = strategyIds.length + assetIds.length;

  if (total < MIN_ITEMS || total > MAX_ITEMS) {
    throw new BacktestError(
      `La comparaison porte sur ${MIN_ITEMS} à ${MAX_ITEMS} éléments.`,
    );
  }

  // Vérification de propriété avant tout calcul : inutile de solliciter Yahoo
  // pour une stratégie qui n'appartient pas au demandeur.
  if (strategyIds.length > 0) {
    const owned = new Set(await getOwnedStrategyIds(strategyIds, userId));
    if (strategyIds.some((id) => !owned.has(id))) {
      throw new BacktestError("Une des stratégies demandées est introuvable.");
    }
  }

  const catalogue =
    assetIds.length > 0
      ? await db
          .select({
            id: assets.id,
            shortLabel: assets.shortLabel,
            isCatalog: assets.isCatalog,
          })
          .from(assets)
          .where(inArray(assets.id, assetIds))
      : [];

  if (catalogue.length !== assetIds.length) {
    throw new BacktestError("Un des supports demandés est introuvable.");
  }

  // `inArray` ne garantit aucun ordre : sans ce réalignement, les colonnes du
  // tableau et la légende sortiraient dans un ordre différent de celui demandé
  // dans l'URL, et donc différent d'un rechargement à l'autre.
  const byId = new Map(catalogue.map((asset) => [asset.id, asset]));
  const orderedAssets = assetIds.map((id) => byId.get(id)!);

  const params: StrategyParams = {
    ...request.params,
    youngAssetResolution: COMPARISON_RESOLUTION,
  };

  /** De quoi rejouer un élément à l'identique sur une autre fenêtre. */
  type ItemPlan =
    | { kind: "strategy"; id: string; selection: StrategyAssetSelection[] }
    | { kind: "asset"; id: string; name: string };

  const plans: ItemPlan[] = [];
  for (const strategyId of strategyIds) {
    // La composition vient de la stratégie, le plan d'investissement de la
    // comparaison.
    plans.push({
      kind: "strategy",
      id: strategyId,
      selection: await strategySelection(strategyId),
    });
  }
  for (const asset of orderedAssets) {
    plans.push({ kind: "asset", id: asset.id, name: asset.shortLabel });
  }

  const execute = async (
    plan: ItemPlan,
    window?: EngineWindow,
  ): Promise<ComparisonRun> => {
    if (plan.kind === "strategy") {
      // Passer la composition en brouillon garantit qu'aucune métrique calculée
      // sous des paramètres qui ne sont pas les siens ne vient polluer le cache
      // de la stratégie.
      const run = await runBacktestForStrategy({
        strategyId: plan.id,
        userId,
        draft: { params, selection: plan.selection },
        // Séries intégrales : l'allègement intervient une fois les courbes
        // fusionnées, sur un calendrier unique.
        downsample: false,
        window,
      });
      return {
        id: run.strategyId,
        kind: "strategy",
        name: run.strategyName,
        result: run.result,
        assets: run.assets,
        warnings: run.warnings,
      };
    }

    const preview = await runBacktestPreview({
      params,
      selection: [{ assetId: plan.id, targetWeight: 1 }],
      downsample: false,
      window,
    });
    return {
      id: plan.id,
      kind: "asset",
      name: plan.name,
      result: preview.result,
      assets: preview.assets,
      warnings: preview.warnings,
    };
  };

  const runs: ComparisonRun[] = [];
  for (const plan of plans) {
    runs.push(await execute(plan));
  }

  // --- Période commune ------------------------------------------------------

  const commonStart = runs.reduce<IsoDate>(
    (latest, run) =>
      run.result.metrics.startDate > latest ? run.result.metrics.startDate : latest,
    runs[0].result.metrics.startDate,
  );
  const commonEnd = runs.reduce<IsoDate>(
    (earliest, run) =>
      run.result.metrics.endDate < earliest ? run.result.metrics.endDate : earliest,
    runs[0].result.metrics.endDate,
  );

  if (commonStart >= commonEnd) {
    throw new BacktestError(
      "Ces éléments n'ont aucune période en commun : leurs historiques ne se recouvrent pas.",
    );
  }

  const truncated = runs
    .filter((run) => run.result.metrics.startDate < commonStart)
    .map((run) => run.name);

  // --- Second passage sur la fenêtre commune --------------------------------

  // Tronquer les courbes après coup ne suffirait pas : un élément dont
  // l'historique remonte plus loin arriverait au premier jour commun avec un
  // capital déjà accru, et sa courbe démarrerait au-dessus des autres sans que
  // cela dise quoi que ce soit de son allocation. On rejoue donc ceux-là sur la
  // fenêtre commune, capital initial et échéancier de versements compris.
  //
  // Le second calcul ne concerne que les éléments réellement décalés — dans le
  // cas courant où tout le monde couvre la même période, il n'a pas lieu. Il
  // aligne aussi les métriques du tableau, qui porteraient sinon sur des
  // périodes différentes d'une colonne à l'autre.
  const commonWindow: EngineWindow = {
    startDate: commonStart,
    endDate: commonEnd,
  };

  for (let i = 0; i < runs.length; i += 1) {
    const { startDate, endDate } = runs[i].result.metrics;
    if (startDate === commonStart && endDate === commonEnd) continue;
    runs[i] = await execute(plans[i], commonWindow);
  }

  // --- Courbes en euros -----------------------------------------------------

  const dateSet = new Set<IsoDate>();
  for (const run of runs) {
    for (const point of run.result.series.portfolio) {
      if (point.date >= commonStart && point.date <= commonEnd) {
        dateSet.add(point.date);
      }
    }
  }
  const dates = [...dateSet].sort();

  const series: ComparisonPoint[] = dates.map((date) => ({ date }));
  const drawdowns: ComparisonPoint[] = dates.map((date) => ({ date }));

  /** Capital versé à chaque date, commun à tous les éléments. */
  const investedByDate = new Array<number>(dates.length).fill(0);

  // En euros constants quand le plan le demande, comme les métriques : afficher
  // une courbe en euros courants sous un réglage annoncé « déflaté de
  // l'inflation » ferait mentir le réglage. Le déflateur vaut 1 au premier jour,
  // le capital initial est donc le même point de départ dans les deux lectures.
  const realMode = params.realReturns;
  const valueOf = (point: PortfolioDayPoint) =>
    realMode ? (point.realValue ?? point.value) : point.value;
  const investedOf = (point: PortfolioDayPoint) =>
    realMode ? (point.realInvested ?? point.invested) : point.invested;

  for (const run of runs) {
    const byDate = new Map(
      run.result.series.portfolio.map((point) => [point.date, point]),
    );

    // Deux lectures, deux échelles.
    //
    // La courbe est en euros : tous les éléments partagent désormais le même
    // plan et la même fenêtre, donc les montants sont directement comparables,
    // et le graphique répond enfin à la question posée — combien vaudrait mon
    // argent. Elle part du capital initial saisi, pas d'un indice base 100.
    //
    // Les baisses subies, elles, restent mesurées sur un indice pondéré par le
    // temps : un versement fait monter la valeur en euros sans que le
    // portefeuille ait gagné quoi que ce soit, et compter cela comme un
    // nouveau sommet effacerait les baisses au lieu de les montrer.
    let lastValue = params.initialAmount;
    let previousValue: number | null = null;
    let previousInvested = 0;
    let level = 1;
    let peak = 1;

    for (let i = 0; i < dates.length; i += 1) {
      const point = byDate.get(dates[i]);
      if (!point) {
        // Jour coté pour un élément mais pas pour un autre : on reporte la
        // dernière valeur connue plutôt que de trouer la courbe.
        series[i][run.id] = lastValue;
        drawdowns[i][run.id] = level / peak - 1;
        continue;
      }

      const value = valueOf(point);
      const invested = investedOf(point);

      if (previousValue !== null && previousValue > 0) {
        const contribution = invested - previousInvested;
        level *= (value - contribution) / previousValue;
      }

      previousValue = value;
      previousInvested = invested;
      lastValue = value;

      if (level > peak) peak = level;

      series[i][run.id] = lastValue;
      drawdowns[i][run.id] = level / peak - 1;

      // Les calendriers peuvent différer d'un jour férié : on retient le
      // versement le plus avancé, qui est celui du plan commun.
      if (invested > investedByDate[i]) {
        investedByDate[i] = invested;
      }
    }
  }

  // Monotone par construction — sauf aux dates absentes du calendrier d'un
  // élément, laissées à zéro par la boucle ci-dessus.
  let investedSoFar = params.initialAmount;
  for (let i = 0; i < dates.length; i += 1) {
    if (investedByDate[i] > investedSoFar) investedSoFar = investedByDate[i];
    series[i][INVESTED_KEY] = investedSoFar;
  }

  // Allègement une fois les courbes alignées : toutes partagent désormais le
  // même calendrier, l'échantillonnage les conserve donc superposables.
  const keep = sampleIndices(dates.length);

  return {
    items: runs.map((run) => ({
      id: run.id,
      kind: run.kind,
      name: run.name,
      metrics: run.result.metrics,
      assets: run.assets,
      sectors: collapseTail(sectorBreakdown(run.assets), 6),
      geography: collapseTail(geoBreakdown(run.assets), 6),
    })),
    series: keep.map((i) => series[i]),
    drawdowns: keep.map((i) => drawdowns[i]),
    commonStart,
    commonEnd,
    truncated,
    warnings: [...new Set(runs.flatMap((run) => run.warnings))],
  };
}


/** Composition enregistrée d'une stratégie, en fractions. */
async function strategySelection(strategyId: string) {
  const rows = await db
    .select({
      assetId: strategyAssets.assetId,
      targetWeight: strategyAssets.targetWeight,
    })
    .from(strategyAssets)
    .where(eq(strategyAssets.strategyId, strategyId))
    .orderBy(asc(strategyAssets.sortOrder));

  if (rows.length === 0) {
    throw new BacktestError("Une des stratégies ne contient aucun actif.");
  }

  return rows.map((row) => ({
    assetId: row.assetId,
    targetWeight: Number(row.targetWeight),
  }));
}
