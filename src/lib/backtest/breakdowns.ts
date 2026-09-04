import type { ResultAssetInfo } from "./run-for-strategy";

/**
 * Agrégation des répartitions sectorielle, géographique et par taille.
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

/**
 * Agrégation pondérée, générique sur la forme des lignes.
 *
 * Générique parce qu'elle sert deux appelants aux types distincts : l'écran de
 * résultats, qui manipule des `ResultAssetInfo`, et l'analyse de robustesse,
 * qui travaille sur une allocation pas encore enregistrée. Dupliquer la
 * pondération dans les deux aurait garanti qu'elles divergent un jour.
 */
export function aggregateBreakdown<T extends { targetWeight: number }>(
  assets: readonly T[],
  pick: (asset: T) => Record<string, number> | null,
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
  return aggregateBreakdown(assets, (asset) => asset.sectorBreakdown);
}

export function geoBreakdown(
  assets: readonly ResultAssetInfo[],
): BreakdownSlice[] {
  return aggregateBreakdown(assets, (asset) => asset.geoBreakdown);
}

/** Ordre de lecture des tailles : de la plus grosse à la plus petite, et non
 *  par poids décroissant. C'est une échelle, pas un classement — l'inverser
 *  selon le portefeuille rendrait deux graphiques incomparables. */
const CAP_ORDER = ["Grandes", "Moyennes", "Petites"];

/**
 * Répartition par taille de capitalisation, **sur la seule poche actions**.
 *
 * Restriction délibérée, et c'est la différence avec les deux agrégations
 * ci-dessus. Une obligation d'État ou un lingot d'or n'ont pas de
 * capitalisation boursière : ce n'est pas une donnée manquante qu'on pourrait
 * un jour combler, c'est une catégorie sans objet. Les inclure ferait afficher
 * « 40 % non renseigné » à un portefeuille équilibré parfaitement documenté, et
 * la seule lecture possible serait fausse.
 *
 * Un actif actions sans décomposition connue — ajouté hors catalogue — reste
 * lui compté en « Non renseigné » : là, l'information manque réellement.
 */
export function capBreakdown(
  assets: readonly ResultAssetInfo[],
): BreakdownSlice[] {
  const equities = assets.filter((asset) => asset.assetClass === "equity");
  if (equities.length === 0) return [];

  return aggregateBreakdown(equities, (asset) => asset.capBreakdown).sort((a, b) => {
    if (a.category === UNKNOWN_CATEGORY) return 1;
    if (b.category === UNKNOWN_CATEGORY) return -1;
    return CAP_ORDER.indexOf(a.category) - CAP_ORDER.indexOf(b.category);
  });
}

/** Part de la poche actions dans le portefeuille, en pourcentage.
 *
 *  Accompagne toujours `capBreakdown` à l'affichage : une répartition par
 *  taille qui ne dirait pas sur quelle fraction du portefeuille elle porte
 *  serait lue comme portant sur le tout. */
export function equityShareOf(assets: readonly ResultAssetInfo[]): number {
  const total = assets.reduce((sum, a) => sum + a.targetWeight, 0);
  if (total <= 0) return 0;

  const equity = assets
    .filter((asset) => asset.assetClass === "equity")
    .reduce((sum, a) => sum + a.targetWeight, 0);

  return (equity / total) * 100;
}

/** Catégorie de reliquat. Nommée ici parce qu'elle peut déjà exister dans les
 *  données : les décompositions curatées rangent elles aussi leur queue de
 *  distribution sous « Autres ». */
const OTHER_CATEGORY = "Autres";

/**
 * Regroupe la traîne des petites catégories.
 *
 * Au-delà d'une dizaine de parts, un donut devient illisible et la palette
 * catégorielle n'a plus de teintes distinctes à offrir. Le reliquat est
 * rassemblé sous « Autres » plutôt que d'inventer des couleurs.
 *
 * Le reliquat est **fusionné** avec l'éventuelle catégorie « Autres » déjà
 * présente, et non ajouté à côté. Sans cela, un ETF monde — dont la
 * décomposition géographique se termine par une ligne « Autres » — produisait
 * une légende à deux entrées « Autres » de valeurs différentes, illisible et
 * qui donnait l'impression d'un bug de calcul.
 */
export function collapseTail(
  slices: readonly BreakdownSlice[],
  maxSlices = 8,
): BreakdownSlice[] {
  if (slices.length <= maxSlices) {
    return [...slices];
  }

  const kept = slices.slice(0, maxSlices - 1);
  const rest = slices.slice(maxSlices - 1);
  const restTotal = rest.reduce((sum, slice) => sum + slice.percent, 0);

  const existing = kept.findIndex(
    (slice) => slice.category === OTHER_CATEGORY,
  );
  if (existing === -1) {
    return [...kept, { category: OTHER_CATEGORY, percent: restTotal }];
  }

  const merged = kept.map((slice, index) =>
    index === existing
      ? { ...slice, percent: slice.percent + restTotal }
      : slice,
  );

  // La fusion peut faire passer « Autres » devant des catégories réelles ; on
  // la renvoie en fin de liste, où l'œil attend un reliquat.
  const other = merged[existing];
  return [...merged.filter((_, index) => index !== existing), other];
}
