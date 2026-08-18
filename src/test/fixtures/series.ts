import { addDays, isWeekend } from "@/lib/engine/calendar";
import type {
  AssetInput,
  EngineInput,
  FeesConfig,
  FxPoint,
  IsoDate,
  PricePoint,
  StrategyParams,
} from "@/lib/engine/types";

/**
 * Séries synthétiques pour les tests du moteur.
 *
 * Toutes les séries sont générées sur des jours de semaine, comme le calendrier
 * de simulation : un test qui produirait des week-ends verrait ses points
 * silencieusement écartés et deviendrait difficile à interpréter.
 */

/** `count` jours de semaine consécutifs à partir de `start` (inclus s'il est ouvré). */
export function weekdays(start: IsoDate, count: number): IsoDate[] {
  const dates: IsoDate[] = [];
  let cursor = start;

  while (dates.length < count) {
    if (!isWeekend(cursor)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

/** Série dont le prix est donné par une fonction de l'indice du jour. */
export function makeSeries(
  start: IsoDate,
  count: number,
  priceAt: (dayIndex: number) => number,
): PricePoint[] {
  return weekdays(start, count).map((date, i) => ({
    date,
    close: priceAt(i),
  }));
}

/** Série à prix constant. */
export function constantSeries(
  start: IsoDate,
  count: number,
  price: number,
): PricePoint[] {
  return makeSeries(start, count, () => price);
}

/** Progression géométrique régulière de `from` à `to` sur toute la série. */
export function growingSeries(
  start: IsoDate,
  count: number,
  from: number,
  to: number,
): PricePoint[] {
  const step = Math.pow(to / from, 1 / (count - 1));
  return makeSeries(start, count, (i) => from * Math.pow(step, i));
}

export function constantFx(
  start: IsoDate,
  count: number,
  rateToEur: number,
): FxPoint[] {
  return weekdays(start, count).map((date) => ({ date, rateToEur }));
}

export const NO_FEES: FeesConfig = {
  brokeragePercent: 0,
  brokerageMinEur: 0,
  spreadPercent: 0,
  applyTer: false,
};

export function makeParams(overrides: Partial<StrategyParams> = {}): StrategyParams {
  return {
    initialAmount: 10_000,
    monthlyContribution: 0,
    years: 100, // Volontairement large : la période est bornée par les données.
    rebalancing: {
      period: "none",
      thresholdEnabled: false,
      thresholdPoints: 5,
    },
    fees: NO_FEES,
    realReturns: false,
    taxation: false,
    benchmark: null,
    youngAssetResolution: null,
    ...overrides,
  };
}

export function makeAsset(
  id: string,
  prices: PricePoint[],
  overrides: Partial<AssetInput> = {},
): AssetInput {
  return {
    id,
    ticker: id,
    label: id,
    ter: null,
    currency: "EUR",
    targetWeight: 1,
    prices,
    ...overrides,
  };
}

export function makeInput(
  assets: AssetInput[],
  params: StrategyParams,
  overrides: Partial<EngineInput> = {},
): EngineInput {
  return { params, assets, fx: {}, ...overrides };
}
