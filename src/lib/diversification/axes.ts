import type { ScoreLevel } from "@/lib/engine/thresholds";

/**
 * Seuils de robustesse d'une allocation.
 *
 * Même parti pris que `engine/thresholds.ts` : des bornes **fixes et assumées**,
 * chacune justifiée en commentaire. Il n'existe pas de vérité universelle sur ce
 * qui fait un portefeuille « bien diversifié », et un score sans justification
 * ne vaudrait pas mieux qu'un avis.
 *
 * Le repère commun de toutes les échelles ci-dessous est le **marché actions
 * mondial investissable** — grandes, moyennes et petites capitalisations de tous
 * les pays, pondérées par leur capitalisation. C'est le seul point de référence
 * neutre : il ne suppose aucune conviction, et tout écart par rapport à lui est
 * un pari que l'investisseur doit au moins savoir qu'il prend.
 *
 * Un mot sur un axe **absent**, parce que son absence est un choix. Le nombre de
 * lignes du portefeuille n'est pas noté. Un ETF monde IMI unique est une
 * excellente allocation ; huit ETF répliquant le S&P 500 en est une mauvaise. Le
 * compte de lignes ne distingue pas les deux, et le noter reviendrait à
 * récompenser la complexité pour elle-même. La concentration qui compte est
 * celle de l'exposition — les quatre premiers axes la mesurent — et le cas
 * réellement dangereux, une ligne unique et étroite qui domine le portefeuille,
 * est signalé comme constat plutôt que dilué dans une note.
 */

export type DiversificationAxisKey =
  | "geography"
  | "sector"
  | "size"
  | "overlap"
  | "correlation";

export interface AxisThreshold {
  label: string;
  /** La question à laquelle l'axe répond, en langage courant. */
  question: string;
  format: "percent" | "ratio";
  higherIsBetter: boolean;
  /** Quatre bornes croissantes délimitant les cinq niveaux. */
  bounds: [number, number, number, number];
  levelLabels: [string, string, string, string, string];
  /** Ce que mesure exactement la valeur. */
  definition: string;
  /** Comment la lire, et le contresens à éviter. */
  interpretation: string;
  /** Où se situe un ETF monde classique, pour donner l'échelle. */
  reference: string;
  /** Vrai si l'axe exige un backtest et n'est donc pas calculable en direct. */
  needsBacktest?: boolean;
}

export const DIVERSIFICATION_AXES: Record<
  DiversificationAxisKey,
  AxisThreshold
> = {
  geography: {
    label: "Géographie",
    question: "Votre portefeuille dépend-il d'un seul pays ?",
    format: "percent",
    higherIsBetter: false,
    // Le marché mondial est à environ 63 % américain : c'est le poids qu'on
    // subit sans faire aucun choix, et il tombe donc en zone « correcte ». Au
    // delà de 70 % on a dépassé le marché, ce qui est un pari sur les
    // États-Unis, assumé ou non. À 85 % il ne reste plus rien pour amortir une
    // décennie perdue sur ce seul marché — l'hypothèse n'a rien de théorique,
    // le Japon l'a vécue de 1990 à 2010.
    bounds: [40, 55, 70, 85],
    levelLabels: [
      "Très concentrée",
      "Concentrée",
      "Correcte",
      "Large",
      "Très large",
    ],
    definition:
      "Part du portefeuille exposée au pays qui pèse le plus lourd dans ses supports.",
    interpretation:
      "Un ETF « monde » ne protège pas de ce risque : il pèse ce que pèsent les marchés, et les États-Unis y représentent près des deux tiers. S'en écarter coûte du rendement quand ce pays surperforme — c'est le prix de ne pas dépendre de lui.",
    reference: "MSCI World : 72 % aux États-Unis. FTSE All-World : 63 %.",
  },

  sector: {
    label: "Secteurs",
    question: "Un secteur décide-t-il du sort de votre portefeuille ?",
    format: "percent",
    higherIsBetter: false,
    // Onze secteurs GICS : à parts strictement égales, chacun pèserait 9 %. Le
    // marché mondial, lui, met environ 26 % en technologie — un niveau déjà
    // historiquement haut, comparable à celui des télécoms en 2000. 30 % marque
    // le seuil au-delà duquel le portefeuille cesse d'être diversifié pour
    // devenir un pari sectoriel.
    bounds: [18, 24, 30, 40],
    levelLabels: [
      "Très concentrée",
      "Concentrée",
      "Correcte",
      "Large",
      "Très large",
    ],
    definition:
      "Part du portefeuille exposée au secteur d'activité qui y pèse le plus lourd.",
    interpretation:
      "La concentration sectorielle se glisse dans les portefeuilles sans qu'on la choisisse : elle vient des indices eux-mêmes, qui suivent les capitalisations. Elle se corrige en ajoutant des zones au profil sectoriel différent — l'Europe, plus industrielle et financière que technologique.",
    reference: "MSCI World : 26 % de technologie. S&P 500 : 32 %.",
  },

  size: {
    label: "Taille de capitalisation",
    question: "Ne détenez-vous que des géants ?",
    format: "percent",
    higherIsBetter: true,
    // Moyennes et petites valeurs représentent ensemble environ 30 % du marché
    // mondial investissable : c'est le niveau « neutre », celui d'un indice IMI.
    // Un indice standard (MSCI World, MSCI Europe) s'arrête aux grandes et
    // moyennes et tombe autour de 14 % — sous-pondéré sans que rien ne le dise.
    // Sous 8 %, le portefeuille est un portefeuille de mégacapitalisations.
    bounds: [8, 15, 22, 30],
    levelLabels: ["Absente", "Faible", "Correcte", "Bonne", "Complète"],
    definition:
      "Part de la poche actions investie en moyennes et petites capitalisations.",
    interpretation:
      "Ce n'est pas une question de performance attendue — la prime de taille est débattue — mais de couverture : un indice standard laisse dehors un septième du marché mondial, et ce septième ne se comporte pas comme le reste.",
    reference:
      "MSCI World : 14 %, uniquement des moyennes. Un indice IMI : environ 29 %.",
  },

  overlap: {
    label: "Recouvrement",
    question: "Vos supports font-ils double emploi ?",
    format: "percent",
    higherIsBetter: false,
    // En deçà de 10 % le recouvrement est du bruit. Au-delà de 40 %, deux
    // lignes du portefeuille achètent largement les mêmes entreprises : la
    // seconde n'ajoute pas de diversification, seulement des frais et une
    // illusion de largeur.
    bounds: [10, 25, 40, 60],
    levelLabels: ["Très fort", "Fort", "Modéré", "Faible", "Négligeable"],
    definition:
      "Part du portefeuille immobilisée dans l'exposition dupliquée du couple de supports le plus redondant.",
    interpretation:
      "C'est le piège classique : ajouter un S&P 500 à un ETF monde donne le sentiment de diversifier alors qu'on ne fait que renforcer les États-Unis. Un recouvrement fort n'est pas une faute en soi — c'est un pari sur la zone dupliquée, à condition de savoir qu'on le prend.",
    reference:
      "Monde + S&P 500 à parts égales : environ 58 %. Monde + émergents : moins de 5 %.",
  },

  correlation: {
    label: "Corrélation réalisée",
    question: "Vos lignes baissent-elles toutes en même temps ?",
    format: "ratio",
    higherIsBetter: false,
    // Deux indices actions larges tournent autour de 0,85 : c'est la norme, pas
    // une anomalie. Descendre sous 0,6 suppose des classes d'actifs
    // différentes — obligations, or. Au-delà de 0,88, les lignes sont
    // interchangeables du point de vue du risque.
    bounds: [0.4, 0.6, 0.75, 0.88],
    levelLabels: ["Très forte", "Forte", "Modérée", "Faible", "Très faible"],
    definition:
      "Corrélation moyenne entre les lignes du portefeuille, sur les rendements mensuels de la période testée.",
    interpretation:
      "Contrairement aux axes précédents, celui-ci est mesuré et non déduit : il dit ce qui s'est réellement produit. Une corrélation faible ne garantit rien pour l'avenir — les corrélations montent précisément dans les krachs, au moment où l'on en aurait besoin.",
    reference:
      "Deux ETF actions larges : 0,85 à 0,95. Actions et obligations d'État : 0,2 à 0,4.",
    needsBacktest: true,
  },
};

/** Ordre d'affichage : les quatre axes structurels d'abord, la mesure ensuite. */
export const AXIS_ORDER: DiversificationAxisKey[] = [
  "geography",
  "sector",
  "size",
  "overlap",
  "correlation",
];

/** Niveaux considérés comme des points à travailler. */
export function isWeak(level: ScoreLevel | null): boolean {
  return level !== null && level <= 2;
}
