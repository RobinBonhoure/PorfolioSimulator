/**
 * Contrat de types du moteur de backtest.
 *
 * Ce fichier est la frontière entre trois mondes : le formulaire de création de
 * stratégie, la persistance Drizzle et le calcul. `StrategyParams` est stocké tel
 * quel en jsonb et consommé tel quel par `runBacktest` — aucune couche de
 * traduction entre les deux, pour qu'une divergence soit une erreur de
 * compilation plutôt qu'un bug silencieux de calcul.
 *
 * Toutes les pondérations et tous les taux sont des **fractions** (0,05 = 5 %).
 * La conversion depuis les pourcentages saisis par l'utilisateur se fait
 * uniquement à la frontière zod.
 */

/** Version de la logique de calcul. Toute modification du moteur susceptible de
 *  changer un résultat doit l'incrémenter : elle entre dans le hash de
 *  paramètres et invalide donc les résultats mis en cache. */
export const ENGINE_VERSION = 1;

/** 252 jours de bourse par an : convention de marché pour l'annualisation. */
export const TRADING_DAYS_PER_YEAR = 252;

// ---------------------------------------------------------------------------
// Paramètres de stratégie
// ---------------------------------------------------------------------------

export type RebalancingPeriod =
  | "none"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export interface RebalancingConfig {
  /** Rééquilibrage de calendrier. `none` le désactive. */
  period: RebalancingPeriod;
  /** Rééquilibrage déclenché par dérive. Cumulable avec le calendrier. */
  thresholdEnabled: boolean;
  /** Dérive tolérée en **points de pourcentage** (5 = ±5 pts), pas en fraction :
   *  c'est ainsi que l'utilisateur raisonne, et la comparaison se fait sur des
   *  écarts de poids absolus. */
  thresholdPoints: number;
}

export interface FeesConfig {
  /** Frais de courtage par ordre, en fraction du montant (0,001 = 0,1 %). */
  brokeragePercent: number;
  /** Plancher de courtage en euros, appliqué par ordre. */
  brokerageMinEur: number;
  /** Spread par transaction, en fraction du montant. */
  spreadPercent: number;
  /** Prélèvement quotidien du TER. Désactivable pour isoler son effet. */
  applyTer: boolean;
}

/** Choix de l'utilisateur quand un actif est plus jeune que la période demandée. */
export type YoungAssetResolution = "start-late" | "use-proxy";

export type BenchmarkChoice = string | null;

export interface StrategyParams {
  initialAmount: number;
  monthlyContribution: number;
  years: number;
  rebalancing: RebalancingConfig;
  fees: FeesConfig;
  /** Déflate la courbe et recalcule les métriques en euros constants. */
  realReturns: boolean;
  /** Ajoute la simulation de fiscalité à la sortie (PEA et CTO). */
  taxation: boolean;
  /** Ticker Yahoo du benchmark, ou `null` pour aucun. */
  benchmark: BenchmarkChoice;
  /** `null` tant que l'utilisateur n'a pas arbitré (déclenche l'alerte). */
  youngAssetResolution: YoungAssetResolution | null;
}

// ---------------------------------------------------------------------------
// Données d'entrée
// ---------------------------------------------------------------------------

/** Date ISO `YYYY-MM-DD`. Le moteur ne manipule jamais d'objets `Date` pour
 *  l'indexation : les chaînes ISO se comparent et se trient lexicographiquement,
 *  ce qui évite toute question de fuseau horaire. */
export type IsoDate = string;

export interface PricePoint {
  date: IsoDate;
  /** Cours de clôture ajusté, dans la devise de cotation de l'actif. */
  close: number;
}

export interface FxPoint {
  date: IsoDate;
  /** Nombre d'euros pour une unité de la devise (USD → EUR). */
  rateToEur: number;
}

export interface InflationPoint {
  /** Premier jour du mois de l'observation. */
  period: IsoDate;
  hicpIndex: number;
}

export interface AssetInput {
  id: string;
  ticker: string;
  label: string;
  /** Frais courants annuels en fraction (0,0038 = 0,38 %). `null` = non applicable. */
  ter: number | null;
  currency: string;
  /** Poids cible en fraction. La somme sur tous les actifs doit valoir 1. */
  targetWeight: number;
  /** Donnée curatée du catalogue. `null` = inconnu, traité comme non bloquant. */
  peaEligible?: boolean | null;
  prices: PricePoint[];
  /** Série du proxy, en devise du proxy, utilisée avant `inceptionDate`.
   *  Absente tant que l'utilisateur n'a pas choisi d'y recourir : on ne
   *  télécharge pas trente ans d'historique pour rien. */
  proxyPrices?: PricePoint[];
  proxyCurrency?: string;
  /** Un proxy existe au catalogue, qu'il ait été chargé ou non.
   *  C'est cette information, et non la présence de `proxyPrices`, qui permet
   *  de proposer l'option à l'utilisateur au moment de l'alerte. */
  hasProxyAvailable?: boolean;
  /** Première date de cotation réelle de l'actif. */
  inceptionDate?: IsoDate;
}

export interface BenchmarkInput {
  id: string;
  ticker: string;
  label: string;
  currency: string;
  prices: PricePoint[];
}

export interface EngineInput {
  params: StrategyParams;
  assets: AssetInput[];
  benchmark?: BenchmarkInput | null;
  /** Séries de change indexées par devise. L'EUR n'y figure pas. */
  fx: Record<string, FxPoint[]>;
  inflation?: InflationPoint[];
  /** Borne haute de la simulation. Par défaut, la dernière date commune. */
  endDate?: IsoDate;
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

export interface PortfolioDayPoint {
  date: IsoDate;
  /** Valeur totale du portefeuille en euros. */
  value: number;
  /** Cumul des sommes versées à cette date. */
  invested: number;
  /** Vrai si au moins un actif est valorisé via son proxy ce jour-là. */
  hasProxyData: boolean;
}

export interface AssetSeriesPoint {
  date: IsoDate;
  /** Valeur de la ligne en euros, par identifiant d'actif. */
  valueByAsset: Record<string, number>;
}

export interface FeeBreakdown {
  /** Total des frais courants prélevés sur la période, en euros. */
  ter: number;
  brokerage: number;
  spread: number;
  total: number;
}

export interface DrawdownInfo {
  /** Amplitude maximale, en fraction négative (-0,42 = -42 %). */
  maxDrawdown: number;
  peakDate: IsoDate | null;
  troughDate: IsoDate | null;
  /** Date de retour au niveau du pic, `null` si jamais récupéré. */
  recoveryDate: IsoDate | null;
  /** Durée pic → récupération, en jours calendaires. `null` si non récupéré. */
  recoveryDays: number | null;
}

export interface PeriodExtreme {
  /** `YYYY-MM` pour un mois, `YYYY` pour une année. */
  period: string;
  /** Rendement de la période, en fraction. */
  return: number;
}

export interface TaxationResult {
  /** Plus-value latente au terme, en euros. */
  capitalGain: number;
  /** Valeur nette après prélèvements sociaux de 17,2 % (PEA, détention ≥ 5 ans). */
  netValuePea: number;
  /** Valeur nette après prélèvement forfaitaire unique de 30 % (CTO). */
  netValueCto: number;
  /** Faux si au moins un actif de la stratégie n'est pas éligible au PEA. */
  peaEligible: boolean;
  /** Libellés des actifs qui bloquent l'éligibilité. */
  peaBlockingAssets: string[];
}

export interface BacktestMetrics {
  startDate: IsoDate;
  endDate: IsoDate;
  /** Nombre d'années réellement simulées (peut être < `params.years`). */
  effectiveYears: number;

  initialValue: number;
  finalValue: number;
  /** Valeur finale du run parallèle sans aucun frais, pour mesurer leur coût. */
  finalValueGross: number;
  totalInvested: number;
  totalGain: number;

  /** Somme des TER pondérée par les poids cibles. */
  weightedTer: number;
  fees: FeeBreakdown;
  /** Écart de valeur finale entre le run avec frais et le run sans frais. */
  feeImpact: number;

  totalReturn: number;
  cagr: number;
  volatility: number;
  drawdown: DrawdownInfo;
  bestMonth: PeriodExtreme | null;
  worstMonth: PeriodExtreme | null;
  bestYear: PeriodExtreme | null;
  worstYear: PeriodExtreme | null;
  /** `null` quand le ratio n'est pas défini (volatilité, risque baissier ou
   *  drawdown nul) — à distinguer d'un mauvais score. */
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;

  /** Présent seulement si `params.realReturns` est actif. */
  real?: {
    finalValue: number;
    totalReturn: number;
    cagr: number;
  };
  /** Présent seulement si `params.taxation` est actif. */
  taxation?: TaxationResult;
}

/** Actif dont l'historique ne couvre pas la période demandée. */
export interface YoungAssetWarning {
  assetId: string;
  label: string;
  inceptionDate: IsoDate;
  /** Vrai si un proxy est disponible pour combler l'antériorité manquante. */
  hasProxy: boolean;
}

export interface BacktestSeries {
  /** Valeur et capital investi jour par jour. */
  portfolio: PortfolioDayPoint[];
  /** Valeur de chaque ligne, pour les aires empilées et l'évolution des poids. */
  byAsset: AssetSeriesPoint[];
  /** Benchmark rebasé sur le capital initial, pour la superposition. */
  benchmark: { date: IsoDate; value: number }[] | null;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  series: BacktestSeries;
  /** Corrélation, rendements glissants et annuels. Voir `analytics.ts`. */
  analytics: import("./analytics").AnalyticsResult;
  /** Actifs plus jeunes que la période : l'UI en fait une alerte. */
  youngAssets: YoungAssetWarning[];
  /** Vrai si des données proxy ont effectivement été utilisées. */
  usedProxyData: boolean;
  /** Ordre d'affichage stable des actifs (identifiants). */
  assetIds: string[];
}
