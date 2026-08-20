/**
 * Projection d'une stratégie dans le futur, par rééchantillonnage par blocs.
 *
 * ## Pourquoi pas un Monte Carlo gaussien
 *
 * La méthode de manuel tire les rendements dans une loi normale calibrée sur la
 * moyenne et l'écart type historiques. Trois raisons de ne pas le faire ici :
 *
 * - les rendements réels ont des queues épaisses et une asymétrie négative ;
 *   une loi normale sous-estime la fréquence des krachs, c'est-à-dire
 *   exactement ce que l'utilisateur cherche à voir ;
 * - elle suppose des mois indépendants, alors que la volatilité arrive en
 *   grappes. Avec des versements mensuels, la **séquence** compte autant que la
 *   moyenne : une mauvaise décennie au début ne produit pas le même résultat
 *   qu'à la fin ;
 * - elle exigerait de modéliser la structure de dépendance entre actifs.
 *
 * Rééchantillonner des **blocs de mois réellement survenus** règle les trois
 * points à la fois : queues épaisses, regroupement de volatilité et corrélations
 * viennent avec les données, sans paramètre à estimer.
 *
 * ## Le rendement espéré est le vrai paramètre
 *
 * La dispersion produite ici est solide ; la tendance centrale ne l'est pas.
 * L'erreur type sur un rendement annuel moyen vaut σ/√années : avec vingt ans
 * d'historique à 15 % de volatilité, elle dépasse trois points, si bien qu'un
 * intervalle de confiance à 95 % couvre une quinzaine de points de rendement.
 *
 * D'où `expectedAnnualReturn` : l'appelant impose la tendance centrale, et le
 * rééchantillonnage n'apporte que la forme de la distribution. Laisser
 * l'historique décider reviendrait à prendre le résultat d'une période
 * particulière pour une propriété permanente du portefeuille.
 *
 * ## Ce que les rendements historiques contiennent déjà
 *
 * Ils proviennent de la série de valeurs du backtest, donc **nets de frais** —
 * TER, courtage et spread compris. Le rendement espéré fourni doit donc
 * lui aussi s'entendre net de frais.
 */

export interface ProjectionConfig {
  /** Capital présent au premier jour de la projection. Zéro correspond au cas
   *  courant : démarrer un plan d'investissement à partir de rien. */
  initialAmount: number;
  monthlyContribution: number;
  years: number;
  /** Rendement annuel espéré **net de frais**. `null` conserve la moyenne
   *  historique — utile pour comparer, déconseillé comme réglage par défaut. */
  expectedAnnualReturn: number | null;
  /** Inflation annuelle supposée. Sert à exprimer le résultat en euros
   *  constants ; mettre 0 pour raisonner en euros courants. */
  expectedInflation: number;
  /** Nombre de trajectoires simulées. */
  paths: number;
  /** Longueur des blocs rééchantillonnés, en mois. */
  blockMonths: number;
  /** Graine du générateur. Fixée par défaut : deux consultations de la même
   *  stratégie doivent donner exactement le même éventail, sinon l'utilisateur
   *  croit que ses chiffres bougent tout seuls. */
  seed: number;
}

export interface ProjectionPoint {
  /** Mois écoulés depuis le début de la projection. */
  month: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  /** Capital engagé à cette date : la mise de départ plus les versements
   *  effectués depuis, chacun compté au pouvoir d'achat de sa propre date.
   *  C'est la ligne de référence de l'éventail — le seuil au-dessus duquel le
   *  placement a préservé le pouvoir d'achat de ce qui y a été mis. */
  invested: number;
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  terminal: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  /** Capital engagé au terme : mise de départ et versements cumulés. */
  totalInvested: number;
  /** Part des trajectoires terminant sous le capital engagé. */
  probabilityBelowInvested: number;
  /** Rendement annualisé de la trajectoire médiane. */
  medianAnnualisedReturn: number;
  /** Nombre de mois d'historique ayant servi de matériau. */
  observations: number;
  /** Moyenne annualisée observée, avant recentrage. */
  historicalAnnualReturn: number;
  historicalVolatility: number;
  /** Tendance centrale effectivement appliquée. */
  appliedAnnualReturn: number;
  /** Vrai si les montants sont exprimés en euros constants. */
  inRealTerms: boolean;
}

export const DEFAULT_PROJECTION: Omit<
  ProjectionConfig,
  "initialAmount" | "monthlyContribution" | "years"
> = {
  // 7 % correspond à l'ordre de grandeur d'un portefeuille actions diversifié
  // sur très longue période. C'est une hypothèse, pas une prévision.
  expectedAnnualReturn: 0.07,
  // Cible de la Banque centrale européenne.
  expectedInflation: 0.02,
  paths: 2_000,
  // Douze mois : assez long pour conserver le regroupement de volatilité,
  // assez court pour que l'historique offre un nombre suffisant de départs
  // distincts.
  blockMonths: 12,
  seed: 20260101,
};

/**
 * Hypothèses de rendement proposées à l'utilisateur.
 *
 * Ce sont des repères **génériques**, indépendants de la stratégie affichée. Ils
 * ne doivent surtout pas s'appeler « historique » : l'interface propose par
 * ailleurs le rendement mesuré sur le backtest de la stratégie en cours, et deux
 * entrées portant le même mot pour des grandeurs différentes — l'une valant
 * 7 %, l'autre parfois 38 % — rendraient le menu incompréhensible.
 */
export const RETURN_ASSUMPTIONS = [
  {
    value: 0.03,
    label: "Prudente",
    description:
      "3 % par an, l'ordre de grandeur d'un portefeuille très défensif.",
  },
  {
    value: 0.05,
    label: "Modérée",
    description:
      "5 % par an, hypothèse conservatrice pour des actions diversifiées.",
  },
  {
    value: 0.07,
    label: "Actions monde",
    description:
      "7 % par an, l'ordre de grandeur des actions mondiales sur très longue période.",
  },
  {
    value: 0.09,
    label: "Optimiste",
    description:
      "9 % par an, un rythme tenu sur certaines décennies seulement, jamais garanti.",
  },
] as const;

/** Nombre minimal d'observations mensuelles pour que la projection ait un sens. */
const MIN_OBSERVATIONS = 24;

export class ProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionError";
  }
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * `Math.random` conviendrait statistiquement, mais rendrait l'éventail
 * légèrement différent à chaque affichage. Une graine fixe garantit qu'une même
 * stratégie, consultée deux fois, montre exactement les mêmes chiffres.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Quantile par interpolation linéaire sur un tableau **déjà trié**. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];

  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Projette une stratégie à partir de ses rendements mensuels historiques.
 *
 * Fonction pure et sans dépendance : elle tourne indifféremment sur le serveur
 * ou dans le navigateur, ce qui permet de recalculer l'éventail instantanément
 * quand l'utilisateur déplace l'horizon ou change d'hypothèse.
 */
export function runProjection(
  monthlyReturns: readonly number[],
  config: ProjectionConfig,
): ProjectionResult {
  if (monthlyReturns.length < MIN_OBSERVATIONS) {
    throw new ProjectionError(
      `Il faut au moins ${MIN_OBSERVATIONS} mois d'historique pour projeter ; ` +
        `cette stratégie n'en compte que ${monthlyReturns.length}.`,
    );
  }

  if (config.initialAmount <= 0 && config.monthlyContribution <= 0) {
    throw new ProjectionError(
      "Renseignez un capital de départ ou un versement mensuel : sans apport, il n'y a rien à projeter.",
    );
  }

  const months = Math.max(1, Math.round(config.years * 12));
  const paths = Math.max(1, config.paths);
  const block = Math.max(1, Math.min(config.blockMonths, monthlyReturns.length));

  if (monthlyReturns.some((value) => value <= -1)) {
    throw new ProjectionError(
      "L'historique contient une perte totale sur un mois : la projection ne peut pas s'appuyer dessus.",
    );
  }

  const historicalMonthlyMean = mean(monthlyReturns);

  const variance =
    monthlyReturns.reduce(
      (sum, value) => sum + (value - historicalMonthlyMean) ** 2,
      0,
    ) / Math.max(1, monthlyReturns.length - 1);
  const historicalVolatility = Math.sqrt(variance) * Math.sqrt(12);

  // Moyenne **géométrique** et non arithmétique. La distinction n'est pas
  // cosmétique : la moyenne arithmétique dépasse la géométrique d'environ σ²/2,
  // soit 1,7 point pour une volatilité de 18 %. Recentrer sur l'arithmétique
  // ferait afficher « rendement historique 8,6 % » à côté d'une projection qui
  // en applique 9,8 % — l'étiquette et le calcul se contrediraient.
  // La moyenne géométrique, elle, est exactement le taux composé que
  // l'utilisateur a en tête quand il dit « 7 % par an ».
  const logMean =
    monthlyReturns.reduce((sum, value) => sum + Math.log(1 + value), 0) /
    monthlyReturns.length;
  const geometricMonthlyGrowth = Math.exp(logMean);
  const historicalAnnualReturn = Math.pow(geometricMonthlyGrowth, 12) - 1;

  // Recentrage par mise à l'échelle des facteurs de croissance, ce qui revient
  // à un décalage additif dans l'espace logarithmique : la dispersion, les
  // asymétries et l'enchaînement des mois sont préservés à l'identique, seule
  // la tendance centrale bouge.
  const appliedAnnualReturn =
    config.expectedAnnualReturn ?? historicalAnnualReturn;
  const targetMonthlyGrowth = Math.pow(1 + appliedAnnualReturn, 1 / 12);
  const scale = targetMonthlyGrowth / geometricMonthlyGrowth;

  const random = createRandom(config.seed);

  // Valeurs par mois et par trajectoire, stockées mois par mois : c'est dans ce
  // sens qu'on lira les quantiles.
  const valuesByMonth: Float64Array[] = Array.from(
    { length: months + 1 },
    () => new Float64Array(paths),
  );

  const maxStart = Math.max(1, monthlyReturns.length - block);

  for (let path = 0; path < paths; path += 1) {
    let value = config.initialAmount;
    valuesByMonth[0][path] = value;

    let month = 0;
    while (month < months) {
      const start = Math.floor(random() * maxStart);

      for (let step = 0; step < block && month < months; step += 1) {
        const growth = (1 + monthlyReturns[start + step]) * scale;
        // Le versement intervient en fin de mois, après application du
        // rendement : il ne travaille donc pas le mois de son dépôt.
        value = value * growth + config.monthlyContribution;
        month += 1;
        valuesByMonth[month][path] = value;
      }
    }
  }

  // Déflation : un montant nominal à trente ans ne veut rien dire. Le facteur
  // est appliqué après coup, la simulation restant menée en euros courants.
  const inRealTerms = config.expectedInflation > 0;
  const deflatorAt = (month: number) =>
    inRealTerms
      ? Math.pow(1 + config.expectedInflation, -month / 12)
      : 1;

  // Capital engagé : la mise de départ, plus chaque versement compté au pouvoir
  // d'achat de la date où il est effectué.
  //
  // Déflater le solde nominal entier à la date finale, comme le ferait un
  // calcul naïf, décrirait le pouvoir d'achat d'un matelas : sur un capital
  // important et des versements modestes, l'érosion de la mise de départ
  // l'emporte et la courbe **décroît**, ce qui est exact mais ne répond pas à
  // la question posée. Ici la référence répond à « mon placement a-t-il au
  // moins préservé le pouvoir d'achat de ce que j'y ai mis », donc chaque euro
  // est figé à sa date d'engagement.
  const committed: number[] = new Array(months + 1);
  committed[0] = config.initialAmount;
  for (let month = 1; month <= months; month += 1) {
    committed[month] =
      committed[month - 1] + config.monthlyContribution * deflatorAt(month);
  }

  const points: ProjectionPoint[] = [];
  for (let month = 0; month <= months; month += 1) {
    const sorted = Array.from(valuesByMonth[month]).sort((a, b) => a - b);
    const deflator = deflatorAt(month);

    points.push({
      month,
      p5: quantile(sorted, 0.05) * deflator,
      p25: quantile(sorted, 0.25) * deflator,
      p50: quantile(sorted, 0.5) * deflator,
      p75: quantile(sorted, 0.75) * deflator,
      p95: quantile(sorted, 0.95) * deflator,
      invested: committed[month],
    });
  }

  const finalSorted = Array.from(valuesByMonth[months]).sort((a, b) => a - b);
  const totalInvested = committed[months];

  // Les trajectoires sont en euros courants et le capital engagé en euros
  // constants : on ramène le seuil en nominal plutôt que de comparer deux
  // grandeurs exprimées dans des unités différentes.
  const nominalThreshold = totalInvested / deflatorAt(months);
  const below = finalSorted.filter((value) => value < nominalThreshold).length;

  const medianFinal = quantile(finalSorted, 0.5);
  const medianAnnualisedReturn =
    config.initialAmount > 0 && config.monthlyContribution === 0
      ? Math.pow(medianFinal / config.initialAmount, 12 / months) - 1
      : // Avec versements, un taux de croissance simple n'a pas de sens : on
        // renvoie la tendance appliquée, qui est la grandeur comparable.
        appliedAnnualReturn;

  const terminalDeflator = deflatorAt(months);

  return {
    points,
    terminal: {
      p5: quantile(finalSorted, 0.05) * terminalDeflator,
      p25: quantile(finalSorted, 0.25) * terminalDeflator,
      p50: medianFinal * terminalDeflator,
      p75: quantile(finalSorted, 0.75) * terminalDeflator,
      p95: quantile(finalSorted, 0.95) * terminalDeflator,
    },
    // Pas de déflation ici : `committed` est déjà exprimé en euros
    // d'aujourd'hui, versement par versement. L'appliquer à nouveau
    // rapetisserait le capital engagé d'un facteur d'inflation entier.
    totalInvested,
    probabilityBelowInvested: below / paths,
    medianAnnualisedReturn,
    observations: monthlyReturns.length,
    historicalAnnualReturn,
    historicalVolatility,
    appliedAnnualReturn,
    inRealTerms,
  };
}


/**
 * Erreur type sur le rendement annuel moyen, en points.
 *
 * C'est le chiffre qui doit accompagner tout CAGR affiché comme hypothèse : il
 * dit à quel point la moyenne mesurée est connue — c'est-à-dire, en général,
 * très mal.
 */
export function meanReturnStandardError(
  annualVolatility: number,
  years: number,
): number {
  if (years <= 0) return Infinity;
  return annualVolatility / Math.sqrt(years);
}
