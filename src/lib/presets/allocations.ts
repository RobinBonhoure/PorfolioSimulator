/**
 * Allocations prêtes à l'emploi.
 *
 * Point de départ, pas recommandation. Un utilisateur qui découvre l'outil se
 * heurte moins à « comment trouver un ETF » qu'à « lequel prendre et dans
 * quelle proportion » ; ces modèles lui donnent une stratégie qui tourne en un
 * clic, qu'il modifie ensuite. C'est ce qui lève le plus de friction, bien plus
 * qu'un système de filtres.
 *
 * Les supports sont désignés par leur **ticker Yahoo** et non par un
 * identifiant : ceux-ci sont générés à l'insertion et diffèrent d'une base à
 * l'autre, alors que le ticker est stable et lisible en relecture.
 *
 * Chaque modèle porte la raison d'être de sa composition. Un préréglage sans
 * explication ne fait que déplacer la question : l'utilisateur ne saurait
 * toujours pas pourquoi 90/10 plutôt que 70/30.
 */

export interface PresetAllocation {
  id: string;
  name: string;
  /** Ce que fait l'allocation, et pour qui elle a du sens. */
  rationale: string;
  /** Vrai si tous les supports sont logeables en PEA. */
  peaEligible: boolean;
  /** Ticker Yahoo et poids en pourcentage. La somme vaut 100. */
  holdings: { ticker: string; weightPercent: number }[];
}

export const PRESET_ALLOCATIONS: PresetAllocation[] = [
  {
    id: "world-100",
    name: "100 % MSCI World",
    rationale:
      "Un seul support, environ 1 500 grandes entreprises de 23 pays développés. C'est l'allocation de référence à laquelle toutes les autres se comparent : rien de plus simple à tenir sur vingt ans, et rien à arbitrer.",
    peaEligible: true,
    holdings: [{ ticker: "WPEA.PA", weightPercent: 100 }],
  },
  {
    id: "world-emerging",
    name: "World + émergents 90/10",
    rationale:
      "Ajoute la Chine, l'Inde et Taïwan, absents du MSCI World. Les 10 % reflètent approximativement le poids des marchés émergents dans la capitalisation mondiale ; ils ajoutent de la volatilité autant que de la diversification.",
    peaEligible: true,
    holdings: [
      { ticker: "WPEA.PA", weightPercent: 90 },
      { ticker: "PAEEM.PA", weightPercent: 10 },
    ],
  },
  {
    id: "regions-monde",
    name: "Réparti par régions",
    rationale:
      "Reconstruit une exposition mondiale région par région, au lieu de subir les 72 % d'Amérique du Nord d'un MSCI World. Vous décidez du poids de chaque zone — c'est plus de travail à suivre, mais c'est le seul moyen de sous-pondérer les États-Unis.",
    peaEligible: true,
    holdings: [
      { ticker: "PE500.PA", weightPercent: 40 },
      { ticker: "MEUD.PA", weightPercent: 30 },
      { ticker: "PAEEM.PA", weightPercent: 20 },
      { ticker: "PTPXE.PA", weightPercent: 10 },
    ],
  },
  {
    id: "europe-monde",
    name: "Monde + Europe renforcée",
    rationale:
      "Un socle mondial complété d'Europe. Le profil sectoriel européen est l'inverse de l'américain — beaucoup de finance, d'industrie et de santé, peu de technologie —, ce qui en fait un complément et non un doublon.",
    peaEligible: true,
    holdings: [
      { ticker: "WPEA.PA", weightPercent: 70 },
      { ticker: "MEUD.PA", weightPercent: 30 },
    ],
  },
  {
    id: "sp500-100",
    name: "100 % S&P 500",
    rationale:
      "Concentré sur les 500 plus grandes entreprises américaines. Historiquement plus performant que le World sur les quinze dernières années, mais c'est un pari sur un seul pays — ce qui n'a pas toujours été gagnant par le passé.",
    peaEligible: true,
    holdings: [{ ticker: "PE500.PA", weightPercent: 100 }],
  },
  {
    id: "world-gold",
    name: "World + or 90/10",
    rationale:
      "L'or est peu corrélé aux actions et sert d'amortisseur dans les crises. En contrepartie il ne produit ni dividende ni bénéfice : sur longue période, il freine la performance autant qu'il lisse les à-coups.",
    peaEligible: false,
    holdings: [
      { ticker: "WPEA.PA", weightPercent: 90 },
      { ticker: "GOLD.PA", weightPercent: 10 },
    ],
  },
  {
    id: "world-satellite",
    name: "World, tech et bitcoin",
    rationale:
      "Un socle mondial complété par deux paris offensifs. Regardez ce que la baisse maximale devient : c'est le prix à payer pour le supplément de rendement, et il se paie au pire moment.",
    peaEligible: false,
    holdings: [
      { ticker: "WPEA.PA", weightPercent: 70 },
      { ticker: "PANX.PA", weightPercent: 20 },
      { ticker: "BTC-EUR", weightPercent: 10 },
    ],
  },
];
