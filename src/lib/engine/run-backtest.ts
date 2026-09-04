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
import { despike } from "./despike";
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
  moneyWeightedReturn,
  monthlyReturns,
  sharpeRatio,
  sortinoRatio,
  timeWeightedReturns,
  yearlyReturns,
} from "./metrics";
import { computeTaxation } from "./taxation";
import {
  type AssetInput,
  type AssetPerformance,
  type AssetSeriesPoint,
  type BacktestResult,
  type BacktestSeries,
  type EngineInput,
  type FeeBreakdown,
  type FeesConfig,
  type IsoDate,
  type PortfolioDayPoint,
  type PricePoint,
  type RealMetrics,
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
  /** Flux du jour vers chaque ligne, frais d'ordre inclus. */
  flowByAsset: number[][];
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
  // Flux du jour vers chaque ligne, frais d'ordre compris.
  //
  // Compter le montant **brut** — celui prélevé sur le versement, avant
  // déduction du courtage et du spread — est ce qui rend le tableau par actif
  // cohérent : la somme des flux égale alors exactement le capital versé, et le
  // coût de l'ordre apparaît en moins-value sur la ligne qui l'a supporté,
  // plutôt que de s'évaporer.
  const flowByAsset: number[][] = Array.from({ length: dayCount }, () =>
    new Array<number>(assetCount).fill(0),
  );

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
      flowByAsset[dayIndex][a] += gross;

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
      const costByAsset = new Array<number>(assetCount).fill(0);
      for (let a = 0; a < assetCount; a += 1) {
        const delta = Math.abs(targets[a] * total - currentValues[a]);
        if (delta <= 0) continue;

        const cost = orderCost(delta, fees);
        feeTotals.brokerage += cost.brokerage;
        feeTotals.spread += cost.spread;
        costByAsset[a] = cost.total;
        tradingCost += cost.total;
      }

      const rebalanced = total - tradingCost;
      for (let a = 0; a < assetCount; a += 1) {
        // Le rééquilibrage ne fait entrer aucun argent neuf : les flux qu'il
        // engendre s'annulent d'une ligne à l'autre. Chaque ligne se voit en
        // revanche imputer le coût de son propre ordre, qui ressortira en
        // moins-value chez elle et non dans un total anonyme.
        flowByAsset[i][a] +=
          targets[a] * rebalanced - currentValues[a] + costByAsset[a];
        units[a] = (targets[a] * rebalanced) / prepared[a].eurPrices[i];
      }
    }

    recordDay(i);
  }

  feeTotals.total = feeTotals.ter + feeTotals.brokerage + feeTotals.spread;

  return {
    values,
    invested,
    contributions,
    valueByAsset,
    flowByAsset,
    fees: feeTotals,
  };
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

  // Une borne imposée prime sur la durée demandée : c'est ce qui permet de
  // rejouer plusieurs allocations sur exactement la même fenêtre.
  const requestedStart = input.startDate ?? shiftYears(endDate, -params.years);

  /** Première date exploitable d'une série, sa contrainte de change comprise.
   *
   *  Un actif en devise n'est exploitable qu'à partir du premier taux de change
   *  connu, même si sa cotation remonte plus loin. La contrainte se calcule
   *  série par série : chaque relais a sa propre devise, et c'est la sienne qui
   *  borne la portion qu'il couvre. */
  const usableFrom = (
    prices: PricePoint[],
    currency: string,
  ): IsoDate | null => {
    const first = firstDateOf(prices);
    if (!first) return null;

    const fxStart = firstFxDate(currency, input.fx);
    return fxStart && fxStart > first ? fxStart : first;
  };

  /** Première date exploitable d'un actif, relais compris. */
  const earliestUsable = (asset: AssetInput): IsoDate => {
    const own = usableFrom(asset.prices, asset.currency)!;
    if (!useProxy) return own;

    // Le meilleur relais n'est pas forcément le premier de la liste : celle-ci
    // est ordonnée par qualité de substitution, pas par ancienneté.
    let earliest = own;
    for (const proxy of asset.proxies ?? []) {
      const start = usableFrom(proxy.prices, proxy.currency);
      if (start && start < earliest) earliest = start;
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
          asset.hasProxyAvailable ?? Boolean(asset.proxies?.length),
      } satisfies YoungAssetWarning;
    })
    .filter((w): w is YoungAssetWarning => w !== null);

  // --- Calendrier et cours en euros ----------------------------------------

  // Les relevés aberrants isolés sont écartés avant toute chose, calendrier
  // compris : un pic laissé passer ici gonflerait la valeur d'une journée,
  // fausserait la volatilité et pourrait déclencher un rééquilibrage sur seuil
  // qui n'a pas eu lieu.
  const cleaned = assets.map((asset) => ({
    ...asset,
    prices: despike(asset.prices).points,
    proxies: asset.proxies?.map((proxy) => ({
      ...proxy,
      prices: despike(proxy.prices).points,
    })),
  }));

  const allSeries = cleaned.flatMap((a) =>
    useProxy && a.proxies?.length
      ? [a.prices, ...a.proxies.map((p) => p.prices)]
      : [a.prices],
  );
  const calendar = buildCalendar(allSeries, startDate, endDate);

  if (calendar.length < 2) {
    throw new BacktestError(
      "Moins de deux jours de cotation sur la période : impossible de simuler.",
    );
  }

  const prepared: PreparedAsset[] = cleaned.map((asset) => {
    const fxRates = buildFxLookup(asset.currency, input.fx, calendar);
    const ownFilled = forwardFill(asset.prices, calendar);
    const ownEur = ownFilled.map((p, i) => (p === null ? null : p * fxRates[i]));

    let prices = ownEur;
    let isProxy = new Array<boolean>(calendar.length).fill(false);

    if (useProxy && asset.proxies?.length) {
      // Les relais sont appliqués dans l'ordre, du plus proche au plus ancien.
      // Chacun se raccorde à ce qui a déjà été reconstitué, et non à la série
      // d'origine : le second relais est donc mis à l'échelle du premier, au
      // point où celui-ci s'arrête. C'est ce qui rend la courbe continue d'un
      // bout à l'autre malgré des niveaux de prix sans rapport entre eux.
      for (const proxy of asset.proxies) {
        const proxyFx = buildFxLookup(proxy.currency, input.fx, calendar);
        const proxyEur = forwardFill(proxy.prices, calendar).map((p, i) =>
          p === null ? null : p * proxyFx[i],
        );

        const spliced = spliceProxy(prices, proxyEur);
        prices = spliced.prices;
        // Une date valorisée par un relais le reste : le drapeau se cumule
        // d'un relais à l'autre, il ne se remplace pas.
        isProxy = isProxy.map((flag, i) => flag || spliced.isProxy[i]);
      }
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

  const riskFreeRate = getAverageRiskFreeRate(calendar);
  const nominal = returnMetrics(returns, calendar, effectiveYears, riskFreeRate);

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
    moneyWeightedReturn: moneyWeightedReturn(
      run.contributions,
      finalValue,
      calendar,
    ),
    ...nominal,
  };

  const deflators =
    params.realReturns && input.inflation?.length
      ? buildDeflators(calendar, input.inflation)
      : null;

  if (deflators) {
    metrics.real = realMetricsOf({
      returns,
      calendar,
      deflators,
      contributions: run.contributions,
      finalValue,
      effectiveYears,
      riskFreeRate,
    });
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

  // Le cumul versé en euros constants se construit jour après jour, chaque
  // versement étant déflaté à sa propre date — le déflater en bloc au taux du
  // jour courant traiterait les versements anciens comme s'ils étaient récents.
  const realInvestedRunning: number[] = [];
  if (deflators) {
    let total = 0;
    for (let i = 0; i < calendar.length; i += 1) {
      total += run.contributions[i] * deflators[i];
      realInvestedRunning.push(total);
    }
  }

  const portfolio: PortfolioDayPoint[] = calendar.map((date, i) => ({
    date,
    value: run.values[i],
    invested: run.invested[i],
    hasProxyData: prepared.some((p) => p.isProxy[i]),
    ...(deflators
      ? {
          realValue: run.values[i] * deflators[i],
          realInvested: realInvestedRunning[i],
        }
      : {}),
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
    benchmark: buildBenchmarkSeries(
      input,
      calendar,
      params.initialAmount,
      deflators,
    ),
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

  const assetPerformance = buildAssetPerformance({
    prepared,
    run,
    finalValue,
    totalGain: finalValue - totalInvested,
    totalInvested,
    effectiveYears,
    deflators: null,
  });

  return {
    metrics,
    series,
    analytics,
    youngAssets,
    usedProxyData,
    assetIds,
    assetPerformance,
    assetPerformanceReal: deflators
      ? buildAssetPerformance({
          prepared,
          run,
          finalValue: finalValue * deflators[deflators.length - 1],
          totalGain: metrics.real!.totalGain,
          totalInvested: metrics.real!.totalInvested,
          effectiveYears,
          deflators,
        })
      : undefined,
  };
}

/** Benchmark rebasé sur le capital initial, pour une superposition lisible. */
function buildBenchmarkSeries(
  input: EngineInput,
  calendar: readonly IsoDate[],
  initialAmount: number,
  deflators: readonly number[] | null,
): BacktestSeries["benchmark"] {
  const benchmark = input.benchmark;
  if (!benchmark || benchmark.prices.length === 0) return null;

  const fxRates = buildFxLookup(benchmark.currency, input.fx, calendar);
  const filled = forwardFill(benchmark.prices, calendar);

  const firstIndex = filled.findIndex((p) => p !== null);
  if (firstIndex === -1) return null;

  const base = filled[firstIndex]! * fxRates[firstIndex];

  return calendar.map((date, i) => {
    const value =
      filled[i] === null ? 0 : (filled[i]! * fxRates[i] * initialAmount) / base;

    return deflators
      ? { date, value, realValue: value * deflators[i] }
      : { date, value };
  });
}

/** Décale une date d'un nombre entier d'années, en conservant le jour du mois. */
function shiftYears(date: IsoDate, years: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Bloc de métriques dérivé d'une série de rendements.
 *
 * Isolé parce qu'il est appliqué deux fois : une fois aux rendements nominaux,
 * une fois aux rendements déflatés. Les recopier à l'identique pour la version
 * réelle aurait garanti qu'ils divergent au premier ajustement.
 */
function returnMetrics(
  returns: readonly number[],
  calendar: readonly IsoDate[],
  effectiveYears: number,
  riskFreeRate: number,
) {
  const index = cumulativeIndex(returns);
  const cagr = annualizedReturn(index[index.length - 1], effectiveYears);
  const volatility = annualizedVolatility(returns);
  const drawdown = maxDrawdown(index, calendar);
  const months = bestAndWorst(monthlyReturns(index, calendar));
  const years = bestAndWorst(yearlyReturns(index, calendar));

  return {
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
}

/**
 * Le portefeuille en euros constants.
 *
 * L'indice cumulé est déflaté point par point, puis la chaîne de rendements est
 * reconstruite à partir de lui — et non l'inverse. C'est ce qui donne une
 * volatilité et une baisse maximale réelles cohérentes : déflater la seule
 * valeur finale laisserait ces deux grandeurs inchangées alors que l'inflation
 * creuse bel et bien les baisses.
 *
 * Le taux sans risque est lui aussi ramené en termes réels, sinon les ratios de
 * Sharpe et de Sortino seraient comparés à une rémunération nominale et
 * ressortiraient artificiellement mauvais.
 */
function realMetricsOf(input: {
  returns: readonly number[];
  calendar: readonly IsoDate[];
  deflators: readonly number[];
  contributions: readonly number[];
  finalValue: number;
  effectiveYears: number;
  riskFreeRate: number;
}): RealMetrics {
  const { deflators, effectiveYears } = input;
  const terminal = deflators[deflators.length - 1];

  const nominalIndex = cumulativeIndex(input.returns);
  const realIndex = nominalIndex.map((value, i) => value * deflators[i]);

  const realReturns: number[] = [];
  for (let i = 1; i < realIndex.length; i += 1) {
    const previous = realIndex[i - 1];
    realReturns.push(previous > 0 ? realIndex[i] / previous - 1 : 0);
  }

  // Inflation annualisée constatée : l'inverse du déflateur terminal, ramené à
  // l'année. Sur dix-sept ans à 2 % l'an, le déflateur vaut environ 0,71.
  const annualInflation =
    effectiveYears > 0 && terminal > 0
      ? Math.pow(1 / terminal, 1 / effectiveYears) - 1
      : 0;

  const realRiskFree = (1 + input.riskFreeRate) / (1 + annualInflation) - 1;

  // Chaque versement est ramené en euros du premier jour, à sa propre date.
  // Déflater le cumul au taux terminal traiterait le versement du mois dernier
  // comme s'il avait été fait au début, et sous-estimerait le capital engagé.
  const realInvested = input.contributions.reduce(
    (total, amount, i) => total + amount * deflators[i],
    0,
  );

  const realFinal = input.finalValue * terminal;

  return {
    finalValue: realFinal,
    totalInvested: realInvested,
    totalGain: realFinal - realInvested,
    totalReturn: realInvested > 0 ? realFinal / realInvested - 1 : 0,
    // Chaque versement est déflaté à sa propre date avant d'entrer dans le
    // calcul du taux : c'est le même raisonnement que pour `realInvested`, et
    // il compte double ici puisque la date de chaque flux fait partie de
    // l'équation.
    moneyWeightedReturn: moneyWeightedReturn(
      input.contributions.map((amount, i) => amount * deflators[i]),
      realFinal,
      input.calendar,
    ),
    annualInflation,
    ...returnMetrics(realReturns, input.calendar, effectiveYears, realRiskFree),
  };
}


/**
 * Détail ligne par ligne.
 *
 * Le montant investi sur une ligne est la somme des flux qui y ont été
 * dirigés — versements répartis au poids cible, mouvements de rééquilibrage, et
 * frais d'ordre imputés à la ligne qui les a provoqués. Sa différence avec la
 * valeur finale donne exactement ce que la ligne a apporté, frais de gestion
 * compris, sans qu'aucun euro ne se perde en route : la somme des montants
 * investis vaut le capital versé, et la somme des gains vaut le gain total.
 *
 * En euros constants, chaque flux est déflaté à **sa** date. Appliquer le
 * déflateur terminal à un cumul traiterait le versement du mois dernier comme
 * s'il datait du premier jour.
 */
function buildAssetPerformance(input: {
  prepared: readonly PreparedAsset[];
  run: SimulationOutput;
  finalValue: number;
  totalGain: number;
  totalInvested: number;
  effectiveYears: number;
  deflators: readonly number[] | null;
}): AssetPerformance[] {
  const { prepared, run, deflators } = input;
  const dayCount = run.flowByAsset.length;
  const lastDay = dayCount - 1;
  const terminal = deflators ? deflators[lastDay] : 1;

  return prepared.map((asset, a) => {
    let invested = 0;
    for (let i = 0; i < dayCount; i += 1) {
      invested += run.flowByAsset[i][a] * (deflators ? deflators[i] : 1);
    }

    // Les versements sont répartis au poids cible, constant : la part d'une
    // ligne vaut donc exactement le capital versé multiplié par son poids, sans
    // qu'il faille en tenir un second compte jour par jour. Ce qui reste de
    // l'écart avec le flux total vient des rééquilibrages.
    const contributed = input.totalInvested * asset.input.targetWeight;

    const finalValue = run.valueByAsset[lastDay][a] * terminal;
    const gain = finalValue - invested;

    const firstPrice = asset.eurPrices[0];
    const lastPrice = asset.eurPrices[lastDay];
    const nominalReturn = firstPrice > 0 ? lastPrice / firstPrice - 1 : 0;
    const assetReturn = deflators
      ? (1 + nominalReturn) * terminal - 1
      : nominalReturn;

    return {
      assetId: asset.input.id,
      invested,
      contributed,
      rebalancingFlow: invested - contributed,
      finalValue,
      gain,
      // Une part de gain n'a de sens que si le portefeuille en a dégagé un.
      // Rapportée à un total nul ou négatif, elle produirait des pourcentages
      // aberrants — 300 % du gain, ou une part négative pour une ligne
      // gagnante.
      gainShare: input.totalGain > 0 ? gain / input.totalGain : null,
      assetReturn,
      assetAnnualReturn: annualizedReturn(1 + assetReturn, input.effectiveYears),
      finalWeight:
        input.finalValue > 0 ? run.valueByAsset[lastDay][a] * terminal / input.finalValue : 0,
      targetWeight: asset.input.targetWeight,
    };
  });
}
