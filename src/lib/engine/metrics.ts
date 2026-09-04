import { daysBetween, monthKey, yearKey } from "./calendar";
import {
  TRADING_DAYS_PER_YEAR,
  type DrawdownInfo,
  type IsoDate,
  type PeriodExtreme,
} from "./types";

/**
 * Mesures de performance et de risque.
 *
 * Toutes les métriques de **risque** (volatilité, drawdown, Sharpe, Sortino) et
 * le CAGR se calculent sur les rendements pondérés par le temps (*time-weighted
 * returns*), jamais sur la valeur brute du portefeuille.
 *
 * La raison est structurelle : un portefeuille alimenté par versements
 * mensuels voit sa valeur monter grâce à l'argent frais. Mesurer un drawdown
 * dessus donnerait une baisse maximale artificiellement faible — l'argent versé
 * pendant la chute masquerait la chute elle-même — et une volatilité qui dépend
 * du montant des versements plutôt que du comportement des actifs. Neutraliser
 * les flux est ce qui rend deux stratégies aux plans d'investissement
 * différents réellement comparables.
 */

/**
 * Rendements quotidiens pondérés par le temps.
 *
 * Le versement du jour est retranché de la valeur de clôture avant comparaison
 * avec la veille : seule la performance des actifs subsiste.
 */
export function timeWeightedReturns(
  values: readonly number[],
  contributions: readonly number[],
): number[] {
  const returns: number[] = [];

  for (let i = 1; i < values.length; i += 1) {
    const previous = values[i - 1];
    if (previous <= 0) {
      returns.push(0);
      continue;
    }
    returns.push((values[i] - contributions[i]) / previous - 1);
  }

  return returns;
}

/**
 * Rendement pondéré par l'argent — le taux de rendement interne des flux.
 *
 * Répond à une question différente de `timeWeightedReturns`, et c'est tout
 * l'intérêt de calculer les deux. Le rendement pondéré par le temps note
 * l'allocation : chaque journée compte autant, quelles que soient les sommes
 * engagées ce jour-là. Celui-ci note ce que l'investisseur a réellement obtenu
 * **sur son argent**, en tenant compte du fait qu'un versement de la première
 * année travaille bien plus longtemps qu'un versement de la dernière.
 *
 * Les deux divergent dès qu'on verse régulièrement, et parfois jusqu'à changer
 * l'ordre de deux allocations. Cas mesuré sur ce projet : un portefeuille
 * moitié actions moitié or affiche un rendement pondéré par le temps supérieur
 * à celui d'un S&P 500 seul, tout en rapportant 66 000 € de moins. L'or avait
 * fait sa course entre 2002 et 2011, quand seuls quelques milliers d'euros
 * étaient investis ; les actions ont fait la leur après 2014, quand la moitié
 * des versements étaient en place. Aucun des deux chiffres n'est faux — ils ne
 * répondent pas à la même question, et publier le premier sans le second
 * laissait l'écart inexpliqué.
 *
 * Résolu par dichotomie plutôt que par Newton : la valeur actuelle nette est
 * strictement décroissante en `r` dès lors que tous les versements précèdent la
 * valorisation finale, ce qui est toujours le cas ici. La dichotomie converge
 * donc à coup sûr, là où Newton peut diverger sur un flux irrégulier.
 *
 * `null` quand la question n'a pas de sens : aucun versement, ou capital
 * entièrement perdu.
 */
export function moneyWeightedReturn(
  contributions: readonly number[],
  finalValue: number,
  /** Dates alignées sur les versements, pour pondérer chaque flux par sa durée. */
  calendar: readonly IsoDate[],
): number | null {
  if (contributions.length === 0 || calendar.length === 0) return null;

  const start = new Date(`${calendar[0]}T00:00:00Z`).getTime();
  const end = new Date(`${calendar[calendar.length - 1]}T00:00:00Z`).getTime();
  const horizon = (end - start) / (365.25 * 86_400_000);
  if (horizon <= 0) return null;

  /** Versements non nuls, en années depuis le début. */
  const flows: { years: number; amount: number }[] = [];
  for (let i = 0; i < contributions.length; i += 1) {
    if (contributions[i] <= 0) continue;
    const t = new Date(`${calendar[i]}T00:00:00Z`).getTime();
    flows.push({
      years: (t - start) / (365.25 * 86_400_000),
      amount: contributions[i],
    });
  }

  if (flows.length === 0) return null;
  if (finalValue <= 0) return -1;

  const npv = (rate: number) => {
    const growth = 1 + rate;
    let total = finalValue / Math.pow(growth, horizon);
    for (const flow of flows) total -= flow.amount / Math.pow(growth, flow.years);
    return total;
  };

  // Bornes larges : −99,99 % couvre la ruine quasi totale, +1 000 % par an
  // dépasse tout ce qu'un marché a produit sur une période mesurable.
  let low = -0.9999;
  let high = 10;
  if (npv(low) < 0 || npv(high) > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (npv(mid) > 0) low = mid;
    else high = mid;
  }

  return (low + high) / 2;
}

/** Indice base 1 obtenu en chaînant les rendements quotidiens. */
export function cumulativeIndex(returns: readonly number[]): number[] {
  const index: number[] = [1];
  let level = 1;

  for (const r of returns) {
    level *= 1 + r;
    index.push(level);
  }

  return index;
}

export function annualizedReturn(
  totalGrowthFactor: number,
  years: number,
): number {
  if (years <= 0 || totalGrowthFactor <= 0) return 0;
  return Math.pow(totalGrowthFactor, 1 / years) - 1;
}

/** Écart-type d'échantillon (dénominateur n − 1). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

export function annualizedVolatility(dailyReturns: readonly number[]): number {
  return standardDeviation(dailyReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Baisse maximale depuis un sommet, avec sa chronologie.
 *
 * `recoveryDate` est la première date où l'indice retrouve son niveau de pic.
 * Elle reste `null` si le portefeuille n'a jamais récupéré d'ici la fin de la
 * période — information au moins aussi utile que l'amplitude elle-même.
 */
export function maxDrawdown(
  index: readonly number[],
  calendar: readonly IsoDate[],
): DrawdownInfo {
  let peak = index[0] ?? 1;
  let peakIndex = 0;
  let worst = 0;
  let worstPeakIndex = 0;
  let worstTroughIndex = 0;

  for (let i = 1; i < index.length; i += 1) {
    if (index[i] > peak) {
      peak = index[i];
      peakIndex = i;
      continue;
    }

    const drawdown = index[i] / peak - 1;
    if (drawdown < worst) {
      worst = drawdown;
      worstPeakIndex = peakIndex;
      worstTroughIndex = i;
    }
  }

  if (worst === 0) {
    return {
      maxDrawdown: 0,
      peakDate: null,
      troughDate: null,
      recoveryDate: null,
      recoveryDays: null,
    };
  }

  const peakLevel = index[worstPeakIndex];
  let recoveryIndex: number | null = null;
  for (let i = worstTroughIndex + 1; i < index.length; i += 1) {
    if (index[i] >= peakLevel) {
      recoveryIndex = i;
      break;
    }
  }

  const peakDate = calendar[worstPeakIndex] ?? null;
  const recoveryDate =
    recoveryIndex !== null ? (calendar[recoveryIndex] ?? null) : null;

  return {
    maxDrawdown: worst,
    peakDate,
    troughDate: calendar[worstTroughIndex] ?? null,
    recoveryDate,
    recoveryDays:
      peakDate && recoveryDate ? daysBetween(peakDate, recoveryDate) : null,
  };
}

/** Courbe *underwater* : écart au dernier sommet, en fraction négative. */
export function underwaterCurve(index: readonly number[]): number[] {
  const curve: number[] = [];
  let peak = index[0] ?? 1;

  for (const level of index) {
    if (level > peak) peak = level;
    curve.push(level / peak - 1);
  }

  return curve;
}

function periodReturns(
  index: readonly number[],
  calendar: readonly IsoDate[],
  keyOf: (date: IsoDate) => string,
): PeriodExtreme[] {
  if (calendar.length === 0) return [];

  const results: PeriodExtreme[] = [];
  let periodStartLevel = index[0];
  let currentKey = keyOf(calendar[0]);

  for (let i = 1; i < calendar.length; i += 1) {
    const key = keyOf(calendar[i]);
    if (key !== currentKey) {
      results.push({
        period: currentKey,
        return: index[i - 1] / periodStartLevel - 1,
      });
      periodStartLevel = index[i - 1];
      currentKey = key;
    }
  }

  results.push({
    period: currentKey,
    return: index[index.length - 1] / periodStartLevel - 1,
  });

  return results;
}

export function monthlyReturns(
  index: readonly number[],
  calendar: readonly IsoDate[],
): PeriodExtreme[] {
  return periodReturns(index, calendar, monthKey);
}

export function yearlyReturns(
  index: readonly number[],
  calendar: readonly IsoDate[],
): PeriodExtreme[] {
  return periodReturns(index, calendar, yearKey);
}

export function bestAndWorst(periods: readonly PeriodExtreme[]): {
  best: PeriodExtreme | null;
  worst: PeriodExtreme | null;
} {
  if (periods.length === 0) return { best: null, worst: null };

  let best = periods[0];
  let worst = periods[0];

  for (const period of periods) {
    if (period.return > best.return) best = period;
    if (period.return < worst.return) worst = period;
  }

  return { best, worst };
}

/**
 * Excédent de rendement par unité de volatilité totale.
 *
 * Renvoie `null` — et non zéro — quand le dénominateur est nul. Un portefeuille
 * sans aucune variation n'a pas un Sharpe médiocre : son ratio n'est pas défini.
 * Retourner zéro le ferait passer pour le pire de la comparaison alors qu'il
 * n'appartient pas à l'échelle. L'interface affiche un tiret dans ce cas.
 */
export function sharpeRatio(
  annualReturn: number,
  volatility: number,
  riskFreeRate: number,
): number | null {
  if (volatility === 0) return null;
  return (annualReturn - riskFreeRate) / volatility;
}

/**
 * Sortino : comme le Sharpe, mais ne pénalise que la volatilité **baissière**.
 *
 * Le seuil de référence est le taux sans risque ramené au jour, et non zéro :
 * un rendement inférieur au taux sans risque est un manque à gagner, même s'il
 * est positif. La convention retenue divise la somme des carrés des écarts
 * négatifs par le nombre total d'observations, ce qui est la définition
 * habituelle du *downside deviation*.
 */
export function sortinoRatio(
  dailyReturns: readonly number[],
  annualReturn: number,
  riskFreeRate: number,
): number | null {
  if (dailyReturns.length === 0) return null;

  const dailyTarget = riskFreeRate / TRADING_DAYS_PER_YEAR;
  let sumSquares = 0;

  for (const r of dailyReturns) {
    const shortfall = r - dailyTarget;
    if (shortfall < 0) sumSquares += shortfall ** 2;
  }

  const downsideDeviation =
    Math.sqrt(sumSquares / dailyReturns.length) *
    Math.sqrt(TRADING_DAYS_PER_YEAR);

  // Aucune séance sous le seuil : le risque baissier mesuré est nul et le ratio
  // n'est pas défini. Cf. `sharpeRatio` pour le raisonnement.
  if (downsideDeviation === 0) return null;
  return (annualReturn - riskFreeRate) / downsideDeviation;
}

/** Rendement annualisé rapporté à la pire baisse subie pour l'obtenir.
 *  `null` en l'absence de baisse, pour la même raison que le Sharpe. */
export function calmarRatio(
  annualReturn: number,
  maxDrawdownValue: number,
): number | null {
  if (maxDrawdownValue === 0) return null;
  return annualReturn / Math.abs(maxDrawdownValue);
}

/**
 * Corrélation de Pearson entre deux séries de rendements.
 *
 * Renvoie 0 quand une série est constante : la corrélation n'est pas définie
 * dans ce cas, et 0 est le choix le plus lisible dans une matrice.
 */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const meanA = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const meanB = b.slice(0, n).reduce((x, y) => x + y, 0) / n;

  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }

  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}
