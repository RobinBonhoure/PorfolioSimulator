import {
  buildAnnualReturns,
  buildCorrelationMatrix,
  buildMonthlyPortfolioReturns,
  buildRollingReturns,
  type AnalyticsResult,
} from "./analytics";
import {
  buildCalendar,
  daysBetween,
  firstBusinessDayIndices,
  forwardFill,
  monthsBetween,
} from "./calendar";
import { getAverageRiskFreeRate } from "./constants/risk-free-rate";
import { ZERO_FEES, orderCost, terFactorForElapsedDays } from "./fees";
import { buildFxLookup, firstFxDate } from "./fx";
import { buildDeflators } from "./inflation";
import {
  annualizedReturn,
  annualizedVolatility,
  bestAndWorst,
  calmarRatio,
  cumulativeIndex,
  maxDrawdown,
  monthlyReturns,
  sharpeRatio,
  sortinoRatio,
  timeWeightedReturns,
  yearlyReturns,
} from "./metrics";
import { computeTaxation } from "./taxation";
import {
  type AssetInput,
  type AssetSeriesPoint,
  type BacktestResult,
  type BacktestSeries,
  type EngineInput,
  type FeeBreakdown,
  type FeesConfig,
  type IsoDate,
  type PortfolioDayPoint,
  type RebalancingPeriod,
  type YoungAssetWarning,
} from "./types";

export class BacktestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestError";
  }
}

const PERIOD_MONTHS: Record<Exclude<RebalancingPeriod, "none">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Tolérance sur la somme des poids : absorbe les arrondis de saisie à deux décimales. */
const WEIGHT_TOLERANCE = 1e-6;

interface PreparedAsset {
  input: AssetInput;
  /** Cours en euros pour chaque jour du calendrier. */
  eurPrices: number[];
  /** Vrai aux dates valorisées par le proxy plutôt que par l'actif lui-même. */
  isProxy: boolean[];
}

interface SimulationOutput {
  values: number[];
  invested: number[];
  contributions: number[];
  valueByAsset: number[][];
  fees: FeeBreakdown;
}

// ---------------------------------------------------------------------------
// Préparation des séries
// ---------------------------------------------------------------------------

function firstDateOf(points: readonly { date: IsoDate }[]): IsoDate | null {
  if (points.length === 0) return null;
  return points.reduce(
    (min, p) => (p.date < min ? p.date : min),
    points[0].date,
  );
}

function lastDateOf(points: readonly { date: IsoDate }[]): IsoDate | null {
  if (points.length === 0) return null;
  return points.reduce(
    (max, p) => (p.date > max ? p.date : max),
    points[0].date,
  );
}

/**
 * Prolonge une série vers le passé avec celle de son proxy.
 *
 * Les deux séries n'ont aucune raison d'être au même niveau de prix : un ETF à
 * 450 € et l'indice à 3 200 points décrivent la même chose à des échelles
 * différentes. On ne peut donc pas les concaténer telles quelles. Le proxy est
 * remis à l'échelle par un facteur constant, calculé au point de jonction, de
 * sorte que seule sa **variation** soit reprise et que le raccord soit continu.
 */
function spliceProxy(
  ownPrices: readonly (number | null)[],
  proxyPrices: readonly (number | null)[],
): { prices: (number | null)[]; isProxy: boolean[] } {
  const firstOwnIndex = ownPrices.findIndex((p) => p !== null);
  const prices = [...ownPrices];
  const isProxy = new Array(ownPrices.length).fill(false);

  if (firstOwnIndex <= 0) return { prices, isProxy };

  const ownAtJunction = ownPrices[firstOwnIndex];
  const proxyAtJunction = proxyPrices[firstOwnIndex];
  if (
    ownAtJunction === null ||
    proxyAtJunction === null ||
    proxyAtJunction === 0
  ) {
    return { prices, isProxy };
  }

  const scale = ownAtJunction / proxyAtJunction;

  for (let i = 0; i < firstOwnIndex; i += 1) {
    const proxyPrice = proxyPrices[i];
    if (proxyPrice === null) continue;
    prices[i] = proxyPrice * scale;
    isProxy[i] = true;
  }

  return { prices, isProxy };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Déroule la simulation jour par jour.
 *
 * Ordre des opérations à l'intérieur d'une journée, et il compte : les cours
 * évoluent, le TER est prélevé sur l'encours, le versement mensuel est investi,
 * puis le rééquilibrage est éventuellement déclenché. Investir avant de
 * rééquilibrer évite de payer deux fois des frais sur les mêmes euros.
 */
function simulate(
  prepared: readonly PreparedAsset[],
  calendar: readonly IsoDate[],
  fees: FeesConfig,
  params: EngineInput["params"],
): SimulationOutput {
  const assetCount = prepared.length;
  const dayCount = calendar.length;

  const units = new Array<number>(assetCount).fill(0);
  const values: number[] = new Array(dayCount).fill(0);
  const invested: number[] = new Array(dayCount).fill(0);
  const contributions: number[] = new Array(dayCount).fill(0);
  const valueByAsset: number[][] = [];

  const feeTotals: FeeBreakdown = { ter: 0, brokerage: 0, spread: 0, total: 0 };

  const targets = prepared.map((p) => p.input.targetWeight);

  /** Achète pour `amount` euros au prix du jour, en respectant les poids cibles. */
  const buyAtTargetWeights = (dayIndex: number, amount: number) => {
    for (let a = 0; a < assetCount; a += 1) {
      const gross = amount * targets[a];
      if (gross <= 0) continue;

      const cost = orderCost(gross, fees);
      feeTotals.brokerage += cost.brokerage;
      feeTotals.spread += cost.spread;

      const price = prepared[a].eurPrices[dayIndex];
      units[a] += (gross - cost.total) / price;
    }
  };

  // Jour 1 : mise en place du capital initial.
  buyAtTargetWeights(0, params.initialAmount);
  contributions[0] = params.initialAmount;
  invested[0] = params.initialAmount;

  const contributionDays = new Set(
    params.monthlyContribution > 0 ? firstBusinessDayIndices(calendar) : [],
  );

  const periodMonths =
    params.rebalancing.period === "none"
      ? null
      : PERIOD_MONTHS[params.rebalancing.period];
  const calendarRebalanceDays = new Set<number>();
  if (periodMonths !== null) {
    for (const dayIndex of firstBusinessDayIndices(calendar)) {
      const elapsed = monthsBetween(calendar[0], calendar[dayIndex]);
      if (elapsed > 0 && elapsed % periodMonths === 0) {
        calendarRebalanceDays.add(dayIndex);
      }
    }
  }

  const thresholdFraction = params.rebalancing.thresholdEnabled
    ? params.rebalancing.thresholdPoints / 100
    : null;

  const recordDay = (dayIndex: number) => {
    const perAsset: number[] = new Array(assetCount);
    let total = 0;

    for (let a = 0; a < assetCount; a += 1) {
      const value = units[a] * prepared[a].eurPrices[dayIndex];
      perAsset[a] = value;
      total += value;
    }

    values[dayIndex] = total;
    valueByAsset.push(perAsset);
    return total;
  };

  recordDay(0);

  for (let i = 1; i < dayCount; i += 1) {
    invested[i] = invested[i - 1];

    // 1. Frais courants, prélevés sur l'encours de chaque ligne au prorata des
    //    jours écoulés depuis la séance précédente.
    const elapsedDays = daysBetween(calendar[i - 1], calendar[i]);
    for (let a = 0; a < assetCount; a += 1) {
      const factor = terFactorForElapsedDays(
        prepared[a].input.ter,
        fees,
        elapsedDays,
      );
      if (factor === 1) continue;

      const valueBefore = units[a] * prepared[a].eurPrices[i];
      units[a] *= factor;
      feeTotals.ter += valueBefore * (1 - factor);
    }

    // 2. Versement programmé.
    if (contributionDays.has(i)) {
      buyAtTargetWeights(i, params.monthlyContribution);
      contributions[i] = params.monthlyContribution;
      invested[i] += params.monthlyContribution;
    }

    // 3. Rééquilibrage, par calendrier ou par dérive.
    let total = 0;
    const currentValues: number[] = new Array(assetCount);
    for (let a = 0; a < assetCount; a += 1) {
      currentValues[a] = units[a] * prepared[a].eurPrices[i];
      total += currentValues[a];
    }

    let shouldRebalance = calendarRebalanceDays.has(i);
    if (!shouldRebalance && thresholdFraction !== null && total > 0) {
      for (let a = 0; a < assetCount; a += 1) {
        if (Math.abs(currentValues[a] / total - targets[a]) >= thresholdFraction) {
          shouldRebalance = true;
          break;
        }
      }
    }

    if (shouldRebalance && total > 0) {
      // Les frais des ordres sont retranchés de l'encours avant réallocation :
      // le portefeuille atteint exactement les poids cibles, sur une base
      // amputée du coût de l'opération.
      let tradingCost = 0;
      for (let a = 0; a < assetCount; a += 1) {
        const delta = Math.abs(targets[a] * total - currentValues[a]);
        if (delta <= 0) continue;

        const cost = orderCost(delta, fees);
        feeTotals.brokerage += cost.brokerage;
        feeTotals.spread += cost.spread;
        tradingCost += cost.total;
      }

      const rebalanced = total - tradingCost;
      for (let a = 0; a < assetCount; a += 1) {
        units[a] = (targets[a] * rebalanced) / prepared[a].eurPrices[i];
      }
    }

    recordDay(i);
  }

  feeTotals.total = feeTotals.ter + feeTotals.brokerage + feeTotals.spread;

  return { values, invested, contributions, valueByAsset, fees: feeTotals };
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

/**
 * Exécute un backtest complet.
 *
 * Fonction pure : mêmes entrées, mêmes sorties, aucun accès réseau ni base de
 * données. C'est ce qui la rend testable sur des séries synthétiques dont on
 * connaît le résultat à la main.
 */
export function runBacktest(input: EngineInput): BacktestResult {
  const { params, assets } = input;

  if (assets.length === 0) {
    throw new BacktestError("Une stratégie doit contenir au moins un actif.");
  }

  const weightSum = assets.reduce((sum, a) => sum + a.targetWeight, 0);
  if (Math.abs(weightSum - 1) > WEIGHT_TOLERANCE) {
    throw new BacktestError(
      `La somme des poids vaut ${(weightSum * 100).toFixed(2)} % au lieu de 100 %.`,
    );
  }

  const useProxy = params.youngAssetResolution === "use-proxy";

  // --- Bornes temporelles ---------------------------------------------------

  const lastDates = assets
    .map((a) => lastDateOf(a.prices))
    .filter((d): d is IsoDate => d !== null);
  if (lastDates.length !== assets.length) {
    throw new BacktestError(
      "Au moins un actif ne dispose d'aucun historique de cours.",
    );
  }

  let endDate = lastDates.reduce((min, d) => (d < min ? d : min));
  if (input.endDate && input.endDate < endDate) endDate = input.endDate;

  const requestedStart = shiftYears(endDate, -params.years);

  /** Première date exploitable d'un actif, contraintes de change comprises. */
  const earliestUsable = (asset: AssetInput): IsoDate => {
    const own = firstDateOf(asset.prices)!;
    const proxyFirst =
      useProxy && asset.proxyPrices?.length
        ? firstDateOf(asset.proxyPrices)
        : null;

    let earliest = proxyFirst && proxyFirst < own ? proxyFirst : own;

    // Un actif en devise n'est exploitable qu'à partir du premier taux de
    // change connu, même si sa propre cotation remonte plus loin.
    const fxStart = firstFxDate(asset.currency, input.fx);
    if (fxStart && fxStart > earliest) earliest = fxStart;

    if (useProxy && asset.proxyCurrency) {
      const proxyFx = firstFxDate(asset.proxyCurrency, input.fx);
      if (proxyFx && proxyFx > earliest) earliest = proxyFx;
    }

    return earliest;
  };

  const startDate = assets.reduce<IsoDate>((latest, asset) => {
    const usable = earliestUsable(asset);
    return usable > latest ? usable : latest;
  }, requestedStart);

  if (startDate >= endDate) {
    throw new BacktestError(
      "La période commune aux actifs sélectionnés est vide. " +
        "Retirez l'actif le plus récent ou raccourcissez la durée.",
    );
  }

  // --- Actifs trop jeunes ---------------------------------------------------

  const youngAssets: YoungAssetWarning[] = assets
    .map((asset) => {
      const own = firstDateOf(asset.prices)!;
      if (own <= requestedStart) return null;
      return {
        assetId: asset.id,
        label: asset.label,
        inceptionDate: own,
        // On se fie au catalogue, pas aux séries chargées : celles-ci ne le
        // sont qu'une fois l'option choisie, et l'alerte précède ce choix.
        hasProxy:
          asset.hasProxyAvailable ?? Boolean(asset.proxyPrices?.length),
      } satisfies YoungAssetWarning;
    })
    .filter((w): w is YoungAssetWarning => w !== null);

  // --- Calendrier et cours en euros ----------------------------------------

  const allSeries = assets.flatMap((a) =>
    useProxy && a.proxyPrices ? [a.prices, a.proxyPrices] : [a.prices],
  );
  const calendar = buildCalendar(allSeries, startDate, endDate);

  if (calendar.length < 2) {
    throw new BacktestError(
      "Moins de deux jours de cotation sur la période : impossible de simuler.",
    );
  }

  const prepared: PreparedAsset[] = assets.map((asset) => {
    const fxRates = buildFxLookup(asset.currency, input.fx, calendar);
    const ownFilled = forwardFill(asset.prices, calendar);
    const ownEur = ownFilled.map((p, i) => (p === null ? null : p * fxRates[i]));

    let prices = ownEur;
    let isProxy = new Array<boolean>(calendar.length).fill(false);

    if (useProxy && asset.proxyPrices?.length) {
      const proxyFx = buildFxLookup(
        asset.proxyCurrency ?? asset.currency,
        input.fx,
        calendar,
      );
      const proxyEur = forwardFill(asset.proxyPrices, calendar).map((p, i) =>
        p === null ? null : p * proxyFx[i],
      );
      const spliced = spliceProxy(ownEur, proxyEur);
      prices = spliced.prices;
      isProxy = spliced.isProxy;
    }

    const firstMissing = prices.findIndex((p) => p === null || p <= 0);
    if (firstMissing !== -1) {
      throw new BacktestError(
        `Cours manquant pour ${asset.label} au ${calendar[firstMissing]}.`,
      );
    }

    return { input: asset, eurPrices: prices as number[], isProxy };
  });

  // --- Simulation -----------------------------------------------------------

  const run = simulate(prepared, calendar, params.fees, params);
  // Second passage sans aucun frais : c'est l'écart entre les deux qui donne le
  // coût réel des frais, bien plus parlant qu'un total en euros isolé.
  const grossRun = simulate(prepared, calendar, ZERO_FEES, params);

  // --- Métriques ------------------------------------------------------------

  const returns = timeWeightedReturns(run.values, run.contributions);
  const index = cumulativeIndex(returns);

  const effectiveYears =
    (new Date(`${endDate}T00:00:00Z`).getTime() -
      new Date(`${startDate}T00:00:00Z`).getTime()) /
    (365.25 * 86_400_000);

  const growthFactor = index[index.length - 1];
  const cagr = annualizedReturn(growthFactor, effectiveYears);
  const volatility = annualizedVolatility(returns);
  const drawdown = maxDrawdown(index, calendar);
  const riskFreeRate = getAverageRiskFreeRate(calendar);

  const months = bestAndWorst(monthlyReturns(index, calendar));
  const years = bestAndWorst(yearlyReturns(index, calendar));

  const finalValue = run.values[run.values.length - 1];
  const totalInvested = run.invested[run.invested.length - 1];

  const weightedTer = assets.reduce(
    (sum, a) => sum + (a.ter ?? 0) * a.targetWeight,
    0,
  );

  const metrics: BacktestResult["metrics"] = {
    startDate,
    endDate,
    effectiveYears,
    initialValue: params.initialAmount,
    finalValue,
    finalValueGross: grossRun.values[grossRun.values.length - 1],
    totalInvested,
    totalGain: finalValue - totalInvested,
    weightedTer,
    fees: run.fees,
    feeImpact: grossRun.values[grossRun.values.length - 1] - finalValue,
    totalReturn: totalInvested > 0 ? finalValue / totalInvested - 1 : 0,
    cagr,
    volatility,
    drawdown,
    bestMonth: months.best,
    worstMonth: months.worst,
    bestYear: years.best,
    worstYear: years.worst,
    sharpe: sharpeRatio(cagr, volatility, riskFreeRate),
    sortino: sortinoRatio(returns, cagr, riskFreeRate),
    calmar: calmarRatio(cagr, drawdown.maxDrawdown),
  };

  if (params.realReturns && input.inflation?.length) {
    const deflators = buildDeflators(calendar, input.inflation);
    const realFinal = finalValue * deflators[deflators.length - 1];
    const realGrowth = growthFactor * deflators[deflators.length - 1];

    metrics.real = {
      finalValue: realFinal,
      totalReturn: totalInvested > 0 ? realFinal / totalInvested - 1 : 0,
      cagr: annualizedReturn(realGrowth, effectiveYears),
    };
  }

  if (params.taxation) {
    metrics.taxation = computeTaxation({
      finalValue,
      totalInvested,
      years: effectiveYears,
      nonPeaAssetLabels: assets
        .filter((a) => a.peaEligible === false)
        .map((a) => a.label),
    });
  }

  // --- Séries ---------------------------------------------------------------

  const assetIds = assets.map((a) => a.id);
  const usedProxyData = prepared.some((p) => p.isProxy.some(Boolean));

  const portfolio: PortfolioDayPoint[] = calendar.map((date, i) => ({
    date,
    value: run.values[i],
    invested: run.invested[i],
    hasProxyData: prepared.some((p) => p.isProxy[i]),
  }));

  const byAsset: AssetSeriesPoint[] = calendar.map((date, i) => {
    const valueByAsset: Record<string, number> = {};
    for (let a = 0; a < assetIds.length; a += 1) {
      valueByAsset[assetIds[a]] = run.valueByAsset[i][a];
    }
    return { date, valueByAsset };
  });

  const series: BacktestSeries = {
    portfolio,
    byAsset,
    benchmark: buildBenchmarkSeries(input, calendar, params.initialAmount),
  };

  const analytics: AnalyticsResult = {
    correlation: buildCorrelationMatrix(
      prepared.map((p) => ({
        id: p.input.id,
        label: p.input.label,
        eurPrices: p.eurPrices,
      })),
      calendar,
    ),
    annualReturns: buildAnnualReturns(index, calendar),
    rollingReturns: buildRollingReturns(index, calendar),
    monthlyPortfolioReturns: buildMonthlyPortfolioReturns(index, calendar),
  };

  return { metrics, series, analytics, youngAssets, usedProxyData, assetIds };
}

/** Benchmark rebasé sur le capital initial, pour une superposition lisible. */
function buildBenchmarkSeries(
  input: EngineInput,
  calendar: readonly IsoDate[],
  initialAmount: number,
): BacktestSeries["benchmark"] {
  const benchmark = input.benchmark;
  if (!benchmark || benchmark.prices.length === 0) return null;

  const fxRates = buildFxLookup(benchmark.currency, input.fx, calendar);
  const filled = forwardFill(benchmark.prices, calendar);

  const firstIndex = filled.findIndex((p) => p !== null);
  if (firstIndex === -1) return null;

  const base = filled[firstIndex]! * fxRates[firstIndex];

  return calendar.map((date, i) => ({
    date,
    value:
      filled[i] === null ? 0 : (filled[i]! * fxRates[i] * initialAmount) / base,
  }));
}

/** Décale une date d'un nombre entier d'années, en conservant le jour du mois. */
function shiftYears(date: IsoDate, years: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
