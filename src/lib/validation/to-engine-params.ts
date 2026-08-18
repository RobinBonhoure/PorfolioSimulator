import type { StrategyParams, YoungAssetResolution } from "@/lib/engine/types";
import type { StrategyFormValues } from "./strategy.schema";

/**
 * Traduit les valeurs du formulaire en paramètres du moteur.
 *
 * Unique point de conversion pourcentage → fraction. Toute autre division par
 * cent ailleurs dans le code est une erreur en puissance.
 */
export function toEngineParams(
  form: StrategyFormValues,
  youngAssetResolution: YoungAssetResolution | null = null,
): StrategyParams {
  return {
    initialAmount: form.initialAmount,
    monthlyContribution: form.monthlyContribution,
    years: form.years,
    rebalancing: {
      period: form.rebalancing.period,
      thresholdEnabled: form.rebalancing.thresholdEnabled,
      // Le seuil reste en points de pourcentage : c'est son unité naturelle,
      // et le moteur le compare à des écarts de poids exprimés de même.
      thresholdPoints: form.rebalancing.thresholdPoints,
    },
    fees: {
      brokeragePercent: form.fees.brokeragePercent / 100,
      brokerageMinEur: form.fees.brokerageMinEur,
      spreadPercent: form.fees.spreadPercent / 100,
      applyTer: form.fees.applyTer,
    },
    realReturns: form.realReturns,
    taxation: form.taxation,
    benchmark: form.benchmark,
    youngAssetResolution,
  };
}

/** Conversion inverse, pour ré-alimenter l'éditeur depuis une stratégie enregistrée. */
export function fromEngineParams(
  params: StrategyParams,
): Omit<StrategyFormValues, "name" | "description" | "assets"> {
  return {
    initialAmount: params.initialAmount,
    monthlyContribution: params.monthlyContribution,
    years: params.years,
    rebalancing: { ...params.rebalancing },
    fees: {
      brokeragePercent: params.fees.brokeragePercent * 100,
      brokerageMinEur: params.fees.brokerageMinEur,
      spreadPercent: params.fees.spreadPercent * 100,
      applyTer: params.fees.applyTer,
    },
    realReturns: params.realReturns,
    taxation: params.taxation,
    benchmark: params.benchmark,
  };
}

/**
 * Poids du formulaire (pourcentages) vers la sélection du moteur (fractions).
 *
 * Les poids sont **renormalisés** pour sommer exactement à 1. Le formulaire
 * tolère un écart d'un centième de point autour de 100 % — indispensable pour
 * saisir des tiers — là où le moteur exige la somme exacte à 10⁻⁶ près. Sans
 * cette renormalisation, une allocation 33,33 / 33,33 / 33,34 passerait la
 * validation puis serait rejetée au calcul, ce qui serait incompréhensible
 * pour l'utilisateur.
 */
export function toSelection(form: StrategyFormValues) {
  const sum = form.assets.reduce((total, a) => total + a.weightPercent, 0);
  if (sum <= 0) return [];

  return form.assets.map((asset) => ({
    assetId: asset.assetId,
    targetWeight: asset.weightPercent / sum,
  }));
}
