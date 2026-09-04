import type { DiversifiableHolding } from "./types";

/**
 * Recouvrement d'exposition entre deux supports.
 *
 * Personne ne publie la liste complète des lignes d'un ETF sous une forme
 * exploitable, et la stocker pour cinquante supports serait un projet à part
 * entière. On l'estime donc à partir des décompositions déjà curatées, avec une
 * hypothèse explicite : **géographie, secteur et taille sont supposés
 * indépendants**, si bien que le recouvrement est le produit des trois.
 *
 * L'hypothèse est fausse dans le détail — la technologie américaine pèse plus
 * lourd que le produit de « américain » par « technologique » — mais elle est
 * fausse dans le bon sens et dans de petites proportions. Vérification sur le
 * couple qui compte : MSCI World contre S&P 500 donne 0,72 × 0,94 × 0,86, soit
 * 58 %, quand le recouvrement réel des portefeuilles tourne autour de 65 %.
 * L'estimation reste du bon ordre de grandeur et, surtout, sépare sans
 * ambiguïté les couples redondants des couples complémentaires — c'est tout ce
 * qu'on lui demande.
 *
 * Deux cas échappent à l'estimation et sont traités exactement :
 *
 * - **Classes d'actifs différentes** : une obligation et une action ne
 *   partagent aucune ligne, quelles que soient leurs décompositions. Un ETF
 *   d'obligations d'État françaises et un ETF actions France afficheraient
 *   pourtant « France 100 % » tous les deux.
 * - **Même indice répliqué** : recouvrement de 1, sans estimation. C'est le
 *   doublon le plus fréquent et le plus facile à corriger.
 */

/** Somme des minima catégorie par catégorie, sur deux répartitions
 *  renormalisées. Vaut 1 pour deux répartitions identiques, 0 pour deux
 *  répartitions disjointes. */
function categoryOverlap(
  a: Record<string, number> | null,
  b: Record<string, number> | null,
): number | null {
  if (!a || !b) return null;

  const totalA = Object.values(a).reduce((s, v) => s + v, 0);
  const totalB = Object.values(b).reduce((s, v) => s + v, 0);
  if (totalA <= 0 || totalB <= 0) return null;

  let sum = 0;
  for (const [category, value] of Object.entries(a)) {
    const other = b[category];
    if (other === undefined) continue;
    sum += Math.min(value / totalA, other / totalB);
  }
  return sum;
}

/**
 * Recouvrement estimé entre deux lignes, de 0 à 1.
 *
 * Un facteur inconnu est neutralisé à 1 plutôt qu'à 0 : faute de données, on ne
 * peut pas affirmer que deux supports sont distincts. Surestimer le
 * recouvrement fait au pire signaler un doublon inexistant, que l'utilisateur
 * écarte d'un coup d'œil ; le sous-estimer laisserait passer le vrai.
 */
export function pairOverlap(
  a: DiversifiableHolding,
  b: DiversifiableHolding,
): number {
  if (a.assetClass !== b.assetClass) return 0;

  if (a.trackedIndex && b.trackedIndex && a.trackedIndex === b.trackedIndex) {
    return 1;
  }

  const geo = categoryOverlap(a.geoBreakdown, b.geoBreakdown) ?? 1;
  const sector = categoryOverlap(a.sectorBreakdown, b.sectorBreakdown) ?? 1;
  const cap = categoryOverlap(a.capBreakdown, b.capBreakdown) ?? 1;

  return geo * sector * cap;
}

export interface OverlapPair {
  a: DiversifiableHolding;
  b: DiversifiableHolding;
  /** Recouvrement des deux expositions, de 0 à 1. */
  overlap: number;
  /** Part du portefeuille immobilisée dans la duplication, en pourcentage. */
  duplicated: number;
  /** Vrai quand les deux lignes répliquent littéralement le même indice. */
  sameIndex: boolean;
}

/**
 * Part du portefeuille dupliquée par un couple, en pourcentage.
 *
 * `2 × min(poids) × recouvrement`, et le minimum est le point important : c'est
 * la plus petite des deux lignes qui borne ce qui est réellement en double. Une
 * ligne de 3 % recouvrant à 90 % une ligne de 60 % ne met pas en cause le
 * portefeuille — la formule renvoie 5,4 %, et non 90 %. Un couple à parts
 * égales et fortement recouvrant, lui, remonte à la hauteur de l'enjeu.
 */
function duplicatedWeight(
  a: DiversifiableHolding,
  b: DiversifiableHolding,
  overlap: number,
): number {
  return 2 * Math.min(a.weight, b.weight) * overlap * 100;
}

/** Tous les couples redondants, du plus lourd au plus léger. */
export function overlapPairs(
  holdings: readonly DiversifiableHolding[],
): OverlapPair[] {
  const pairs: OverlapPair[] = [];

  for (let i = 0; i < holdings.length; i += 1) {
    for (let j = i + 1; j < holdings.length; j += 1) {
      const a = holdings[i];
      const b = holdings[j];
      const overlap = pairOverlap(a, b);
      if (overlap <= 0) continue;

      pairs.push({
        a,
        b,
        overlap,
        duplicated: duplicatedWeight(a, b, overlap),
        sameIndex:
          a.trackedIndex !== null && a.trackedIndex === b.trackedIndex,
      });
    }
  }

  return pairs.sort((x, y) => y.duplicated - x.duplicated);
}

/**
 * Le couple le plus redondant, celui qui porte la note de l'axe.
 *
 * Le maximum, et non la somme des couples : additionner ferait compter trois
 * fois le même recouvrement dans un portefeuille de trois ETF monde, et
 * dépasserait 100 % sans que ça veuille dire quoi que ce soit. Le maximum
 * désigne en outre le couple sur lequel agir.
 */
export function worstOverlap(
  holdings: readonly DiversifiableHolding[],
): OverlapPair | null {
  return overlapPairs(holdings)[0] ?? null;
}
