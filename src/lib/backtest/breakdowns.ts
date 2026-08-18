import type { ResultAssetInfo } from "./run-for-strategy";

/**
 * Agrégation des répartitions sectorielle et géographique.
 *
 * Chaque actif apporte sa propre décomposition, pondérée par son poids cible.
 * Un ETF MSCI World à 60 % contribue donc 60 % de ses 26 % de technologie, soit
 * 15,6 points au secteur technologique du portefeuille.
 *
 * Traitement des données manquantes : les actifs sans décomposition connue —
 * ceux ajoutés hors catalogue — sont regroupés dans une catégorie
 * « Non renseigné » explicite, et **pas** exclus du calcul. Les exclure
 * renormaliserait le reste à 100 % et présenterait comme complète une
 * répartition qui ne couvre en réalité qu'une partie du portefeuille.
 */

export const UNKNOWN_CATEGORY = "Non renseigné";

export interface BreakdownSlice {
  category: string;
  /** Part du portefeuille, en pourcentage. */
  percent: number;
}

function aggregate(
  assets: readonly ResultAssetInfo[],
  pick: (asset: ResultAssetInfo) => Record<string, number> | null,
): BreakdownSlice[] {
  const totals = new Map<string, number>();

  const totalWeight = assets.reduce((sum, a) => sum + a.targetWeight, 0);
  if (totalWeight <= 0) return [];

  for (const asset of assets) {
    const share = asset.targetWeight / totalWeight;
    const breakdown = pick(asset);

    if (!breakdown || Object.keys(breakdown).length === 0) {
      totals.set(
        UNKNOWN_CATEGORY,
        (totals.get(UNKNOWN_CATEGORY) ?? 0) + share * 100,
      );
      continue;
    }

    // Les décompositions curatées somment à 100 à l'arrondi près ; on
    // renormalise chacune pour que les petits écarts ne s'accumulent pas d'un
    // actif à l'autre.
    const assetTotal = Object.values(breakdown).reduce((s, v) => s + v, 0);
    if (assetTotal <= 0) continue;

    for (const [category, value] of Object.entries(breakdown)) {
      const contribution = share * (value / assetTotal) * 100;
      totals.set(category, (totals.get(category) ?? 0) + contribution);
    }
  }

  return [...totals.entries()]
    .map(([category, percent]) => ({ category, percent }))
    .sort((a, b) => {
      // « Non renseigné » reste en dernier quelle que soit sa taille : c'est
      // une absence de donnée, pas une catégorie d'investissement.
      if (a.category === UNKNOWN_CATEGORY) return 1;
      if (b.category === UNKNOWN_CATEGORY) return -1;
      return b.percent - a.percent;
    });
}

export function sectorBreakdown(
  assets: readonly ResultAssetInfo[],
): BreakdownSlice[] {
  return aggregate(assets, (asset) => asset.sectorBreakdown);
}

export function geoBreakdown(
  assets: readonly ResultAssetInfo[],
): BreakdownSlice[] {
  return aggregate(assets, (asset) => asset.geoBreakdown);
}

/**
 * Regroupe la traîne des petites catégories.
 *
 * Au-delà d'une dizaine de parts, un donut devient illisible et la palette
 * catégorielle n'a plus de teintes distinctes à offrir. Le reliquat est
 * rassemblé sous « Autres » plutôt que d'inventer des couleurs.
 */
export function collapseTail(
  slices: readonly BreakdownSlice[],
  maxSlices = 8,
): BreakdownSlice[] {
  if (slices.length <= maxSlices) return [...slices];

  const kept = slices.slice(0, maxSlices - 1);
  const rest = slices.slice(maxSlices - 1);
  const restTotal = rest.reduce((sum, slice) => sum + slice.percent, 0);

  return [...kept, { category: "Autres", percent: restTotal }];
}
