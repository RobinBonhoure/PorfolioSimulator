import { z } from "zod";

/**
 * Schémas de validation des stratégies.
 *
 * Une seule définition sert au formulaire et aux server actions : une règle
 * écrite deux fois finit toujours par diverger, et c'est la validation serveur
 * qui protège réellement les données.
 *
 * **Unités.** L'utilisateur saisit des pourcentages (0,38 % de frais, 60 % de
 * poids) ; le moteur travaille en fractions. La conversion se fait ici et
 * nulle part ailleurs, pour qu'il n'existe qu'un seul endroit où se tromper
 * d'un facteur cent.
 */

/** Poids maximal cumulé toléré autour de 100 %, en points de pourcentage. */
const WEIGHT_SUM_TOLERANCE = 0.01;

export const rebalancingPeriodSchema = z.enum([
  "none",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);

export const rebalancingSchema = z.object({
  period: rebalancingPeriodSchema,
  thresholdEnabled: z.boolean(),
  thresholdPoints: z
    .number()
    .min(1, "Le seuil doit valoir au moins 1 point")
    .max(50, "Un seuil au-delà de 50 points ne se déclencherait jamais"),
});

/** Frais tels que saisis : en pourcentage, pas en fraction. */
export const feesInputSchema = z.object({
  brokeragePercent: z.number().min(0).max(5),
  brokerageMinEur: z.number().min(0).max(100),
  spreadPercent: z.number().min(0).max(5),
  applyTer: z.boolean(),
});

export const strategyAssetInputSchema = z.object({
  assetId: z.uuid(),
  /** Poids en pourcentage tel qu'affiché dans l'éditeur. */
  weightPercent: z.number().min(0).max(100),
});

export const strategyFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Donnez un nom à votre stratégie")
      .max(120, "120 caractères maximum"),
    description: z.string().trim().max(500).optional(),
    initialAmount: z
      .number()
      .min(0, "Le capital initial ne peut pas être négatif")
      .max(100_000_000),
    monthlyContribution: z.number().min(0).max(1_000_000),
    years: z
      .number()
      .int()
      .min(1, "Un backtest porte sur au moins un an")
      .max(40, "Au-delà de 40 ans, aucune source ne fournit de données"),
    rebalancing: rebalancingSchema,
    fees: feesInputSchema,
    realReturns: z.boolean(),
    taxation: z.boolean(),
    benchmark: z.string().nullable(),
    assets: z
      .array(strategyAssetInputSchema)
      .min(1, "Ajoutez au moins un actif")
      .max(20, "20 actifs au maximum : au-delà, les graphiques deviennent illisibles"),
  })
  .refine(
    (data) => {
      const sum = data.assets.reduce((s, a) => s + a.weightPercent, 0);
      return Math.abs(sum - 100) <= WEIGHT_SUM_TOLERANCE;
    },
    {
      message: "La somme des poids doit valoir exactement 100 %",
      path: ["assets"],
    },
  )
  .refine(
    (data) => {
      const ids = data.assets.map((a) => a.assetId);
      return new Set(ids).size === ids.length;
    },
    { message: "Un même actif ne peut figurer qu'une fois", path: ["assets"] },
  )
  .refine((data) => data.initialAmount > 0 || data.monthlyContribution > 0, {
    message: "Renseignez un capital initial ou un versement mensuel",
    path: ["initialAmount"],
  });

export type StrategyFormValues = z.infer<typeof strategyFormSchema>;

export const youngAssetResolutionSchema = z
  .enum(["start-late", "use-proxy"])
  .nullable();

/** Valeurs par défaut de l'éditeur, représentatives d'un courtier en ligne. */
export const DEFAULT_STRATEGY_FORM: StrategyFormValues = {
  name: "",
  description: undefined,
  initialAmount: 10_000,
  monthlyContribution: 300,
  years: 10,
  rebalancing: {
    period: "annual",
    thresholdEnabled: false,
    thresholdPoints: 5,
  },
  fees: {
    brokeragePercent: 0.1,
    brokerageMinEur: 0,
    spreadPercent: 0.1,
    applyTer: true,
  },
  realReturns: false,
  taxation: false,
  benchmark: "CW8.PA",
  assets: [],
};
