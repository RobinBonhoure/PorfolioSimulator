import { z } from "zod";

import { rebalancingPeriodSchema } from "./strategy.schema";

/**
 * Validation des requêtes de backtest.
 *
 * Le brouillon est la seule voie par laquelle des paramètres de moteur arrivent
 * du navigateur sans passer par la base : ils sont donc revalidés intégralement
 * ici, bornes comprises. Les limites reprennent celles du formulaire, exprimées
 * dans l'unité du **moteur** — les frais y sont des fractions, là où
 * `strategy.schema` les reçoit en pourcentages.
 */

/** Écart toléré sur la somme des poids. Le moteur exige 1 à 10⁻⁶ près ;
 *  `toSelection` renormalise côté client, et cette vérification garantit qu'on
 *  ne s'en remet pas à lui. */
const WEIGHT_SUM_TOLERANCE = 1e-6;

export const engineParamsSchema = z.object({
  initialAmount: z.number().min(0).max(100_000_000),
  monthlyContribution: z.number().min(0).max(1_000_000),
  years: z.number().int().min(1).max(40),
  rebalancing: z.object({
    period: rebalancingPeriodSchema,
    thresholdEnabled: z.boolean(),
    thresholdPoints: z.number().min(1).max(50),
  }),
  fees: z.object({
    brokeragePercent: z.number().min(0).max(0.05),
    brokerageMinEur: z.number().min(0).max(100),
    spreadPercent: z.number().min(0).max(0.05),
    applyTer: z.boolean(),
  }),
  realReturns: z.boolean(),
  taxation: z.boolean(),
  benchmark: z.string().max(20).nullable(),
  youngAssetResolution: z.enum(["start-late", "use-proxy"]).nullable(),
});

export const backtestDraftSchema = z.object({
  params: engineParamsSchema,
  selection: z
    .array(
      z.object({
        assetId: z.uuid(),
        /** Poids en fraction, pas en pourcentage. */
        targetWeight: z.number().min(0).max(1),
      }),
    )
    .min(1, "Ajoutez au moins un actif")
    .max(20, "20 actifs au maximum")
    .refine(
      (selection) =>
        Math.abs(selection.reduce((sum, a) => sum + a.targetWeight, 0) - 1) <
        WEIGHT_SUM_TOLERANCE,
      "Les poids doivent sommer à 100 %.",
    )
    .refine((selection) => {
      const ids = selection.map((a) => a.assetId);
      return new Set(ids).size === ids.length;
    }, "Un même actif ne peut figurer qu'une fois."),
});

export const backtestRequestSchema = z.object({
  strategyId: z.uuid(),
  youngAssetResolution: z.enum(["start-late", "use-proxy"]).nullish(),
  /** Paramètres saisis mais pas encore enregistrés. Absent ou nul : la
   *  stratégie est calculée telle qu'elle est en base. */
  draft: backtestDraftSchema.nullish(),
});
