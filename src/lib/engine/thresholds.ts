/**
 * Seuils de notation et contenu pédagogique des métriques.
 *
 * Chaque métrique est ramenée à une jauge à cinq niveaux. Les bornes sont
 * **fixes et assumées** : il n'existe pas de vérité universelle sur ce qui fait
 * un « bon » Sharpe, et prétendre le contraire serait malhonnête. Elles
 * reprennent les repères usuels de la gestion de portefeuille, et chaque choix
 * est justifié en commentaire pour que le lecteur puisse en juger — et les
 * modifier en connaissance de cause.
 *
 * Les valeurs de référence citées sont celles d'un portefeuille 100 % MSCI
 * World en euros sur la période 2000-2025 : environ 6,5 % de rendement
 * annualisé, 15 % de volatilité, −54 % de baisse maximale (2008) et un Sharpe
 * autour de 0,35. Ce sont des ordres de grandeur destinés à situer un résultat,
 * pas des chiffres officiels.
 */

export type ScoreLevel = 1 | 2 | 3 | 4 | 5;

export type MetricKey =
  | "cagr"
  | "moneyWeightedReturn"
  | "volatility"
  | "maxDrawdown"
  | "sharpe"
  | "sortino"
  | "calmar"
  | "weightedTer";

export type MetricFormat = "percent" | "ratio";

export interface MetricThreshold {
  label: string;
  format: MetricFormat;
  /** Vrai si une valeur élevée vaut mieux qu'une valeur basse. */
  higherIsBetter: boolean;
  /** Quatre bornes croissantes délimitant les cinq niveaux. */
  bounds: [number, number, number, number];
  /** Libellés du niveau 1 au niveau 5, dans le vocabulaire de la métrique. */
  levelLabels: [string, string, string, string, string];
  /** Ce que mesure la métrique, en une phrase. */
  definition: string;
  /** Comment la lire, et quel piège éviter. */
  interpretation: string;
  /** Repère chiffré du MSCI World, pour situer le résultat. */
  reference: string;
}

export const METRIC_THRESHOLDS: Record<MetricKey, MetricThreshold> = {
  cagr: {
    label: "Rendement annualisé",
    format: "percent",
    higherIsBetter: true,
    // 3 % correspond à peu près à l'inflation de long terme : en dessous, le
    // capital ne progresse pas en pouvoir d'achat. 10 % est le niveau des
    // meilleures décennies actions, difficile à tenir durablement.
    bounds: [0, 0.03, 0.06, 0.1],
    levelLabels: ["Négatif", "Faible", "Correct", "Bon", "Excellent"],
    definition:
      "Taux de croissance annuel moyen qui, appliqué chaque année, mènerait du point de départ au point d'arrivée.",
    interpretation:
      "Calculé sur les rendements pondérés par le temps : il mesure la performance des actifs choisis, indépendamment du calendrier de vos versements. Deux stratégies aux versements différents restent donc comparables.",
    reference: "MSCI World 2000-2025 : environ 6,5 % par an en euros.",
  },

  moneyWeightedReturn: {
    label: "Rendement de votre argent",
    format: "percent",
    higherIsBetter: true,
    // Mêmes bornes que le rendement annualisé : c'est la même grandeur, un
    // taux de croissance annuel, et leur donner des échelles différentes
    // interdirait de lire l'écart entre les deux d'un coup d'œil — alors que
    // cet écart est précisément ce que la métrique apporte.
    bounds: [0, 0.03, 0.06, 0.1],
    levelLabels: ["Négatif", "Faible", "Correct", "Bon", "Excellent"],
    definition:
      "Taux annuel qui, appliqué à chacun de vos versements depuis sa date, aboutirait au montant final.",
    interpretation:
      "À comparer au rendement annualisé juste au-dessus. Celui-ci note l'allocation, période par période ; celui-là note ce que votre argent a réellement gagné. Les deux divergent dès qu'on verse régulièrement, et peuvent classer deux allocations en sens inverse : une allocation dont la hausse arrive tôt, quand peu d'argent est investi, affiche un excellent rendement annualisé pour un gain final modeste.",
    reference:
      "Sur un versement unique, les deux chiffres coïncident. Sur un versement mensuel, un écart de 1 à 3 points est courant.",
  },

  volatility: {
    label: "Volatilité annualisée",
    format: "percent",
    higherIsBetter: false,
    // 15 % est le repère d'un portefeuille actions diversifié ; au-delà de 30 %
    // on est dans le registre des actifs spéculatifs.
    bounds: [0.08, 0.12, 0.2, 0.3],
    levelLabels: ["Très élevée", "Élevée", "Modérée", "Faible", "Très faible"],
    definition:
      "Amplitude typique des variations quotidiennes, ramenée à une échelle annuelle.",
    interpretation:
      "Une volatilité élevée n'est pas mauvaise en soi : elle indique l'inconfort à supporter en chemin. La vraie question est de savoir si vous auriez tenu sans vendre.",
    reference: "MSCI World : environ 15 % par an. Un fonds euros : moins de 1 %.",
  },

  maxDrawdown: {
    label: "Baisse maximale",
    format: "percent",
    higherIsBetter: true,
    // Valeurs négatives : −0,5 signifie que le portefeuille a perdu la moitié
    // de sa valeur entre son sommet et son creux.
    bounds: [-0.5, -0.3, -0.2, -0.1],
    levelLabels: [
      "Très risquée",
      "Risquée",
      "Modérée",
      "Contenue",
      "Très contenue",
    ],
    definition:
      "Pire chute subie entre un sommet et le creux qui l'a suivi, avant tout retour au niveau précédent.",
    interpretation:
      "C'est la métrique la plus concrète du risque : elle dit combien vous auriez vu disparaître au pire moment, et pendant combien de temps. La durée de récupération compte autant que l'amplitude.",
    reference:
      "MSCI World : environ −54 % en 2008, avec plus de cinq ans pour revenir au niveau d'avant crise.",
  },

  sharpe: {
    label: "Ratio de Sharpe",
    format: "ratio",
    higherIsBetter: true,
    // Repères classiques de la gestion : au-delà de 1 le couple
    // rendement/risque est remarquable, au-delà de 2 il est rare sur longue
    // période sans levier ni stratégie particulière.
    bounds: [0, 0.5, 1, 2],
    levelLabels: ["Négatif", "Faible", "Correct", "Bon", "Excellent"],
    definition:
      "Rendement obtenu au-delà du taux sans risque, rapporté à la volatilité subie pour l'obtenir.",
    interpretation:
      "Répond à la question « ai-je été payé pour le risque pris ? ». Il pénalise autant les fortes hausses que les fortes baisses, ce qui peut désavantager une stratégie très performante mais irrégulière.",
    reference: "MSCI World 2000-2025 : autour de 0,35.",
  },

  sortino: {
    label: "Ratio de Sortino",
    format: "ratio",
    higherIsBetter: true,
    // Mécaniquement plus élevé que le Sharpe puisqu'il ignore la moitié de la
    // dispersion : les bornes sont relevées en conséquence.
    bounds: [0, 0.75, 1.5, 3],
    levelLabels: ["Négatif", "Faible", "Correct", "Bon", "Excellent"],
    definition:
      "Variante du Sharpe qui ne compte que la volatilité baissière, en ignorant les variations à la hausse.",
    interpretation:
      "Plus juste que le Sharpe pour un investisseur : une forte hausse n'est pas un risque. Un Sortino nettement supérieur au Sharpe signale une stratégie dont l'irrégularité penche du bon côté.",
    reference: "MSCI World : environ 0,5, soit à peu près 1,4 fois son Sharpe.",
  },

  calmar: {
    label: "Ratio de Calmar",
    format: "ratio",
    higherIsBetter: true,
    bounds: [0, 0.25, 0.5, 1],
    levelLabels: ["Négatif", "Faible", "Correct", "Bon", "Excellent"],
    definition:
      "Rendement annualisé rapporté à la pire baisse traversée pour l'obtenir.",
    interpretation:
      "Traduit le rendement en « années de performance perdues au pire moment ». Un Calmar de 0,2 signifie qu'il aurait fallu environ cinq ans de rendement moyen pour effacer la pire chute.",
    reference: "MSCI World : environ 0,12 sur 2000-2025, plombé par 2008.",
  },

  weightedTer: {
    label: "Frais courants pondérés",
    format: "percent",
    higherIsBetter: false,
    // 0,15 % est le niveau des ETF indiciels les moins chers, 1 % celui d'un
    // fonds actif : l'échelle couvre l'ensemble du marché.
    bounds: [0.0015, 0.003, 0.005, 0.01],
    levelLabels: ["Élevés", "Notables", "Corrects", "Bas", "Très bas"],
    definition:
      "Moyenne des frais courants des supports détenus, pondérée par leurs poids cibles.",
    interpretation:
      "Prélevés chaque jour sur l'encours, quelle que soit la performance. C'est le seul paramètre de cette page que vous maîtrisez entièrement à l'avance.",
    reference:
      "ETF MSCI World éligibles PEA : de 0,20 % à 0,38 % selon l'émetteur.",
  },
};
