import {
  FLAT_TAX_RATE,
  SOCIAL_CHARGES_RATE,
  PEA_TAX_FREE_YEARS,
} from "./constants/tax-rates";
import type { TaxationResult } from "./types";

export interface TaxationInput {
  finalValue: number;
  totalInvested: number;
  /** Durée réellement simulée, qui conditionne l'hypothèse des cinq ans du PEA. */
  years: number;
  /** Actifs de la stratégie qui ne sont pas éligibles au PEA. */
  nonPeaAssetLabels: readonly string[];
}

/**
 * Valeur nette au terme, dans les deux enveloppes.
 *
 * Le calcul suppose une sortie totale au dernier jour : c'est l'hypothèse la
 * plus sévère, et la seule qui ne demande pas de modéliser les retraits
 * partiels. Une moins-value n'engendre aucun impôt — les mécanismes
 * d'imputation des pertes sur d'autres gains ne sont pas simulés.
 */
export function computeTaxation(input: TaxationInput): TaxationResult {
  const capitalGain = Math.max(input.finalValue - input.totalInvested, 0);

  const peaEligible = input.nonPeaAssetLabels.length === 0;

  // En deçà de cinq ans, un retrait clôture le plan et perd son avantage : on
  // applique alors le forfait unique, comme en compte-titres, plutôt que
  // d'afficher un net flatteur qui ne correspondrait à aucune situation réelle.
  const peaRate =
    input.years >= PEA_TAX_FREE_YEARS ? SOCIAL_CHARGES_RATE : FLAT_TAX_RATE;

  return {
    capitalGain,
    netValuePea: input.finalValue - capitalGain * peaRate,
    netValueCto: input.finalValue - capitalGain * FLAT_TAX_RATE,
    peaEligible,
    peaBlockingAssets: [...input.nonPeaAssetLabels],
  };
}
