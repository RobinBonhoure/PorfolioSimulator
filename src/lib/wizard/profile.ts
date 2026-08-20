/**
 * Réponses du parcours guidé.
 *
 * Le questionnaire est court par choix. Chaque question supplémentaire est un
 * abandon en puissance, et au-delà de l'horizon et du comportement face à une
 * baisse, les réponses n'apportent presque rien à la répartition : demander la
 * profession ou le patrimoine total donnerait un air de sérieux sans changer un
 * seul pourcentage.
 *
 * Ce que le questionnaire ne fait pas, délibérément : il ne produit pas un
 * conseil personnalisé. Il traduit des réponses en points de départ chiffrés et
 * explique la traduction. C'est la même position que celle des allocations
 * types, et elle doit rester lisible dans les libellés de l'interface.
 */

/** Réaction à une baisse de 30 % — la question qui prédit le mieux le
 *  comportement réel, bien mieux qu'une échelle de risque de 1 à 10. */
export type LossReaction = "sell" | "worry" | "hold" | "buy";

/** Ce que l'utilisateur cherche en priorité dans son allocation. */
export type Priority = "performance" | "stability" | "diversification";

export interface WizardProfile {
  age: number;
  /** Nombre d'années avant d'avoir besoin de cet argent. */
  horizonYears: number;
  initialAmount: number;
  monthlyContribution: number;
  lossReaction: LossReaction;
  priority: Priority;
  /** Supports que l'utilisateur accepte d'intégrer, au-delà du socle
   *  actions/obligations. */
  includeGold: boolean;
  includeCrypto: boolean;
}

export const DEFAULT_PROFILE: WizardProfile = {
  age: 35,
  horizonYears: 15,
  initialAmount: 5_000,
  monthlyContribution: 300,
  lossReaction: "hold",
  priority: "performance",
  includeGold: false,
  includeCrypto: false,
};

export const LOSS_REACTION_LABELS: Record<
  LossReaction,
  { label: string; hint: string }
> = {
  sell: {
    label: "Je vends pour arrêter les pertes",
    hint: "Une allocation trop volatile vous ferait sortir au pire moment.",
  },
  worry: {
    label: "Je m'inquiète mais je ne touche à rien",
    hint: "Supportable, à condition de ne pas y être exposé sur tout le capital.",
  },
  hold: {
    label: "Je ne change rien, c'est le jeu",
    hint: "Le comportement qui permet de tenir une allocation actions.",
  },
  buy: {
    label: "J'en profite pour renforcer",
    hint: "Encore faut-il en avoir les moyens le jour venu.",
  },
};

export const PRIORITY_LABELS: Record<
  Priority,
  { label: string; hint: string }
> = {
  performance: {
    label: "Performance à long terme",
    hint: "Le maximum d'actions que votre horizon et votre tempérament autorisent.",
  },
  stability: {
    label: "Stabilité de la valeur",
    hint: "Moins de baisses à traverser, au prix d'un rendement attendu plus faible.",
  },
  diversification: {
    label: "Décorrélation des sources de rendement",
    hint: "Plusieurs zones et classes d'actifs, pour ne pas dépendre d'un seul marché.",
  },
};
