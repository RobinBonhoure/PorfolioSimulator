import { monthKey, yearKey } from "./calendar";
import { correlation } from "./metrics";
import type { IsoDate, PeriodExtreme } from "./types";

/**
 * Analyses transversales : corrélation, rendements glissants, rendements annuels.
 *
 * Ces mesures se calculent sur les mêmes séries alignées que la simulation —
 * proxy raccordé et change appliqué compris — de sorte qu'une corrélation lue
 * ici porte exactement sur les données qui ont produit la courbe affichée à
 * côté.
 *
 * Point important sur la corrélation : elle est établie à partir des **cours
 * des actifs**, jamais de la valeur des lignes du portefeuille. La valeur d'une
 * ligne bouge aussi sous l'effet des versements et des rééquilibrages, qui sont
 * des décisions de l'investisseur et non des mouvements de marché ; les inclure
 * ferait apparaître une corrélation entre deux actifs qui n'ont en commun que
 * d'être rééquilibrés le même jour.
 */

export interface CorrelationMatrix {
  assetIds: string[];
  labels: string[];
  /** Matrice carrée et symétrique, diagonale à 1. */
  matrix: number[][];
  /** Nombre d'observations mensuelles ayant servi au calcul. */
  observations: number;
}

export interface RollingReturnPoint {
  date: IsoDate;
  /** Rendement annualisé sur la fenêtre glissante, `null` si trop tôt. */
  oneYear: number | null;
  threeYear: number | null;
  fiveYear: number | null;
}

export interface AnalyticsResult {
  correlation: CorrelationMatrix | null;
  /** Rendements du portefeuille par année civile. */
  annualReturns: PeriodExtreme[];
  rollingReturns: RollingReturnPoint[];
  /** Rendements mensuels du portefeuille, de fin de mois à fin de mois.
   *  Matière première du rééchantillonnage de la projection. */
  monthlyPortfolioReturns: number[];
}

/**
 * Rendements du portefeuille d'une fin de mois à la suivante.
 *
 * Le dernier est écarté : la période s'arrête à la dernière cotation
 * disponible, presque jamais en fin de mois, et ce mois tronqué produirait un
 * rendement anormalement faible. Inoffensif dans une moyenne, il ne l'est pas
 * dans un rééchantillonnage, où il serait rejoué comme un mois entier.
 */
export function buildMonthlyPortfolioReturns(
  index: readonly number[],
  calendar: readonly IsoDate[],
): number[] {
  const monthEnds = monthEndIndices(calendar);
  if (monthEnds.length < 3) return [];

  const complete = monthEnds.slice(0, -1);
  return monthlySeriesReturns(index, complete);
}

/** Indices du dernier jour coté de chaque mois du calendrier. */
function monthEndIndices(calendar: readonly IsoDate[]): number[] {
  const indices: number[] = [];

  for (let i = 0; i < calendar.length; i += 1) {
    const isLastOfMonth =
      i === calendar.length - 1 ||
      monthKey(calendar[i + 1]) !== monthKey(calendar[i]);
    if (isLastOfMonth) indices.push(i);
  }

  return indices;
}

/** Rendements mensuels d'une série de cours, en fin de mois. */
function monthlySeriesReturns(
  prices: readonly number[],
  monthEnds: readonly number[],
): number[] {
  const returns: number[] = [];

  for (let i = 1; i < monthEnds.length; i += 1) {
    const previous = prices[monthEnds[i - 1]];
    const current = prices[monthEnds[i]];
    returns.push(previous > 0 ? current / previous - 1 : 0);
  }

  return returns;
}

export function buildCorrelationMatrix(
  assets: readonly { id: string; label: string; eurPrices: readonly number[] }[],
  calendar: readonly IsoDate[],
): CorrelationMatrix | null {
  // Une matrice à un seul actif n'apprend rien, et deux points mensuels ne
  // suffisent pas à établir une corrélation qui veuille dire quelque chose.
  if (assets.length < 2) return null;

  const monthEnds = monthEndIndices(calendar);
  if (monthEnds.length < 4) return null;

  const returnsByAsset = assets.map((asset) =>
    monthlySeriesReturns(asset.eurPrices, monthEnds),
  );

  const matrix = returnsByAsset.map((rowReturns, i) =>
    returnsByAsset.map((colReturns, j) =>
      i === j ? 1 : correlation(rowReturns, colReturns),
    ),
  );

  return {
    assetIds: assets.map((a) => a.id),
    labels: assets.map((a) => a.label),
    matrix,
    observations: monthEnds.length - 1,
  };
}

/** Dernier indice dont la date est antérieure ou égale à la cible. */
function indexAtOrBefore(
  calendar: readonly IsoDate[],
  target: IsoDate,
): number {
  let low = 0;
  let high = calendar.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (calendar[mid] <= target) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

function shiftYears(date: IsoDate, years: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Rendements annualisés sur fenêtres glissantes.
 *
 * Calculés en fin de mois plutôt qu'à chaque séance : la courbe glissante est
 * lisse par construction, un point quotidien n'apporterait rien de visible et
 * multiplierait par vingt le volume transmis au navigateur.
 *
 * Les fenêtres sont délimitées par des **dates** et non par un nombre fixe de
 * séances : compter 252 jours en arrière ferait dériver la fenêtre au fil des
 * années fériées, et « un an glissant » cesserait de valoir un an.
 */
export function buildRollingReturns(
  index: readonly number[],
  calendar: readonly IsoDate[],
): RollingReturnPoint[] {
  const points: RollingReturnPoint[] = [];

  const windowReturn = (
    currentIndex: number,
    years: number,
  ): number | null => {
    const targetDate = shiftYears(calendar[currentIndex], -years);
    if (targetDate < calendar[0]) return null;

    const startIndex = indexAtOrBefore(calendar, targetDate);
    if (startIndex < 0 || index[startIndex] <= 0) return null;

    const growth = index[currentIndex] / index[startIndex];
    return Math.pow(growth, 1 / years) - 1;
  };

  for (const i of monthEndIndices(calendar)) {
    points.push({
      date: calendar[i],
      oneYear: windowReturn(i, 1),
      threeYear: windowReturn(i, 3),
      fiveYear: windowReturn(i, 5),
    });
  }

  return points;
}

/** Rendements du portefeuille par année civile, sur l'indice pondéré par le temps. */
export function buildAnnualReturns(
  index: readonly number[],
  calendar: readonly IsoDate[],
): PeriodExtreme[] {
  if (calendar.length === 0) return [];

  const results: PeriodExtreme[] = [];
  let startLevel = index[0];
  let currentYear = yearKey(calendar[0]);

  for (let i = 1; i < calendar.length; i += 1) {
    const year = yearKey(calendar[i]);
    if (year !== currentYear) {
      results.push({
        period: currentYear,
        return: index[i - 1] / startLevel - 1,
      });
      startLevel = index[i - 1];
      currentYear = year;
    }
  }

  results.push({
    period: currentYear,
    return: index[index.length - 1] / startLevel - 1,
  });

  return results;
}
