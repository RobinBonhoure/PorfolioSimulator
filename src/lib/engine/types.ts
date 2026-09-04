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
export const ENGINE_VERSION = 2;

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

/** Un relais d'historique, avec sa propre devise de cotation. */
export interface ProxySeries {
  prices: PricePoint[];
  currency: string;
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
  /** Relais successifs pour prolonger l'historique vers le passé, **du plus
   *  proche au plus ancien**.
   *
   *  Une liste et non un relais unique, parce que le meilleur substitut n'est
   *  pas toujours le plus ancien. Un ETF émergents récent se prolonge d'abord
   *  par un fonds qui réplique exactement son indice, et seulement au-delà, là
   *  où celui-ci s'arrête, par un fonds plus ancien mais moins fidèle. Chaque
   *  relais n'est ainsi employé que sur la portion où rien de mieux n'existe.
   *
   *  Vide tant que l'utilisateur n'a pas choisi d'y recourir : on ne télécharge
   *  pas trente ans d'historique pour rien. */
  proxies?: ProxySeries[];
  /** Un proxy existe au catalogue, qu'il ait été chargé ou non.
   *  C'est cette information, et non la présence de `proxies`, qui permet
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
  /**
   * Borne basse imposée. Par défaut, `endDate` moins `params.years`.
   *
   * Sert à rejouer plusieurs allocations sur une fenêtre strictement identique :
   * la comparaison s'en sert pour que tout le monde parte le même jour, avec le
   * même capital initial et le même échéancier de versements. Ne fait que
   * repousser le départ — un actif dont l'historique commence plus tard démarre
   * toujours à sa première cotation.
   */
  startDate?: IsoDate;
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
  /** Valeur et capital versé ramenés en euros du premier jour. Renseignés
   *  seulement si `params.realReturns` est actif. Fournis calculés plutôt que
   *  sous forme de déflateur : la vue n'a pas à faire d'arithmétique
   *  financière, et deux consommateurs ne risquent pas de la faire
   *  différemment. */
  realValue?: number;
  realInvested?: number;
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

/**
 * Le même portefeuille, mesuré en euros constants.
 *
 * Jeu **complet** et non un simple appoint : déflater la seule valeur finale
 * laisserait le rendement annualisé, la volatilité, la baisse maximale et les
 * trois ratios en euros courants, tous affichés côte à côte avec un unique
 * chiffre réel. L'utilisateur croirait lire un portefeuille corrigé de
 * l'inflation alors qu'il n'en verrait qu'une ligne.
 *
 * La baisse maximale réelle est plus profonde que la nominale, et c'est
 * exactement le genre d'écart que la moitié d'un calcul masquerait.
 */
export interface RealMetrics {
  finalValue: number;
  /** Chaque versement ramené en euros de la date de départ. */
  totalInvested: number;
  totalGain: number;
  totalReturn: number;
  cagr: number;
  /** Rendement de l'argent placé, versements déflatés à leur propre date et
   *  valeur finale déflatée au taux terminal. Sans lui, la bascule en euros
   *  constants laisserait ce seul chiffre en euros courants au milieu d'un jeu
   *  déflaté — une incohérence invisible et d'autant plus trompeuse. */
  moneyWeightedReturn: number | null;
  volatility: number;
  drawdown: DrawdownInfo;
  bestMonth: PeriodExtreme | null;
  worstMonth: PeriodExtreme | null;
  bestYear: PeriodExtreme | null;
  worstYear: PeriodExtreme | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  /** Inflation annualisée constatée sur la période simulée. */
  annualInflation: number;
}

/**
 * Ce que chaque ligne a apporté au portefeuille.
 *
 * Les colonnes s'additionnent exactement : la somme des montants investis vaut
 * le capital versé, et la somme des gains vaut le gain total. C'est la
 * condition pour qu'un tableau par actif serve à quelque chose — un tableau
 * dont les lignes ne font pas le total invite surtout à se méfier de tout le
 * reste.
 *
 * Trois grandeurs distinctes, dont la confusion est la source d'incompréhension
 * la plus prévisible de ce tableau :
 *
 * - `contributed` : l'argent venu de la poche de l'investisseur, réparti au
 *   poids cible. Toujours positif.
 * - `rebalancingFlow` : ce que les rééquilibrages ont ajouté ou retiré à la
 *   ligne. Signé, et sa somme sur toutes les lignes vaut exactement zéro —
 *   rééquilibrer ne fait entrer aucun argent neuf.
 * - `invested` : la somme des deux. C'est elle qui, retranchée de la valeur,
 *   donne le gain de la ligne.
 *
 * Une ligne qui monte fort est allégée à chaque rééquilibrage. Ses retraits
 * cumulés peuvent dépasser ses apports, auquel cas `invested` devient négatif :
 * la ligne a rendu au portefeuille plus qu'on n'y a versé. Ce n'est pas une
 * anomalie, c'est ce que le rééquilibrage fait — mais c'est assez déroutant
 * pour que l'interface doive montrer la décomposition, et non le seul net.
 */
export interface AssetPerformance {
  assetId: string;
  /** Somme des flux dirigés vers la ligne, frais d'ordre compris.
   *  Vaut `contributed + rebalancingFlow`. */
  invested: number;
  /** Part des versements dirigée vers la ligne, au poids cible. */
  contributed: number;
  /** Apport net des rééquilibrages. Somme nulle sur l'ensemble des lignes. */
  rebalancingFlow: number;
  finalValue: number;
  /** `finalValue - invested` : ce que la ligne a apporté au gain du portefeuille. */
  gain: number;
  /** Part du gain total du portefeuille, en fraction. `null` si le gain total
   *  est nul ou négatif, auquel cas une part n'aurait pas de sens. */
  gainShare: number | null;
  /** Performance propre du support sur la période, indépendamment des montants
   *  engagés et de leur calendrier. */
  assetReturn: number;
  /** La même, ramenée au rythme annuel. Seule grandeur qui permette de comparer
   *  deux supports dont les historiques n'ont pas la même longueur. */
  assetAnnualReturn: number;
  /** Poids effectif au dernier jour, à comparer au poids cible. */
  finalWeight: number;
  targetWeight: number;
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
  /** Rendement annualisé de l'allocation, pondéré par le temps : chaque
   *  période compte autant, quelles que soient les sommes engagées ce
   *  jour-là. C'est la performance des actifs choisis, pas celle du
   *  portefeuille de l'investisseur. */
  cagr: number;
  /** Rendement annualisé de l'argent effectivement placé, versements et dates
   *  compris. Diverge du `cagr` dès qu'on verse régulièrement, et peut classer
   *  deux allocations dans l'ordre inverse. `null` quand rien n'a été versé. */
  moneyWeightedReturn: number | null;
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
  real?: RealMetrics;
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
  /** `realValue` n'est renseigné que si le rendement réel est demandé. La
   *  référence est déflatée comme le portefeuille : la confronter en euros
   *  courants à une courbe en euros constants la ferait paraître meilleure
   *  qu'elle ne l'est, sur le graphique même censé les comparer. */
  benchmark:
    | { date: IsoDate; value: number; realValue?: number }[]
    | null;
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
  /** Détail ligne par ligne, en euros courants. */
  assetPerformance: AssetPerformance[];
  /** Le même détail en euros constants, si le rendement réel est demandé. */
  assetPerformanceReal?: AssetPerformance[];
}
