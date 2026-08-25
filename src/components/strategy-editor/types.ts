import type { Asset } from "@/lib/db/schema";

/** Actif tel que manipulé dans l'éditeur : le strict nécessaire à l'affichage
 *  d'une ligne compacte, plus son poids. */
export interface EditorAsset {
  assetId: string;
  tickerYahoo: string;
  shortLabel: string;
  /** Nom complet, émetteur compris : « Amundi MSCI World UCITS ETF ». */
  name: string;
  type: Asset["type"];
  peaEligible: boolean | null;
  /** Frais courants en fraction, `null` si non applicable (action, crypto). */
  ter: number | null;
  currency: string;
  dataPartial: boolean;
  /** Poids cible en pourcentage, tel que saisi. */
  weightPercent: number;
}

/**
 * Éligibilité PEA de l'ensemble de l'allocation.
 *
 * Un actif d'éligibilité inconnue (ajouté hors catalogue) ne rend pas la
 * stratégie inéligible : il rend le verdict incertain, ce qui n'est pas la même
 * chose et doit s'afficher différemment.
 */
export type PeaVerdict = "eligible" | "ineligible" | "unknown";

export function peaVerdictFor(assets: readonly EditorAsset[]): PeaVerdict {
  if (assets.length === 0) return "unknown";
  if (assets.some((a) => a.peaEligible === false)) return "ineligible";
  if (assets.some((a) => a.peaEligible === null)) return "unknown";
  return "eligible";
}

/** Somme des poids saisis, en pourcentage. */
export function totalWeight(assets: readonly EditorAsset[]): number {
  return assets.reduce((sum, a) => sum + a.weightPercent, 0);
}

/** TER moyen pondéré par les poids cibles, en fraction. */
export function weightedTer(assets: readonly EditorAsset[]): number {
  const total = totalWeight(assets);
  if (total === 0) return 0;

  return assets.reduce(
    (sum, a) => sum + (a.ter ?? 0) * (a.weightPercent / total),
    0,
  );
}

/** Répartit 100 % également, en plaçant l'arrondi sur le dernier actif pour
 *  que la somme tombe juste. */
export function equalWeights(assets: readonly EditorAsset[]): EditorAsset[] {
  if (assets.length === 0) return [];

  const share = Math.floor((100 / assets.length) * 100) / 100;
  return assets.map((asset, index) =>
    index === assets.length - 1
      ? { ...asset, weightPercent: Number((100 - share * (assets.length - 1)).toFixed(2)) }
      : { ...asset, weightPercent: share },
  );
}
