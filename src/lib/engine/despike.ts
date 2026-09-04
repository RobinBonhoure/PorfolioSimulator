import type { PricePoint } from "./types";

/**
 * Retrait des cotations aberrantes isolées.
 *
 * Yahoo publie occasionnellement un relevé faux pour une seule séance, aussitôt
 * démenti par la suivante. Constaté sur ce catalogue le 24 octobre 2025, où
 * `EXUS.DE` bondit de 16,1 % puis rechute de 13,4 %, et `IJPA.AS` de 16,3 %
 * puis −12,9 % — le même jour, avec des rapports quasi identiques, alors que
 * ces deux fonds n'ont ni le même indice ni la même place de cotation. Aucun
 * marché ne fait cela ; un fournisseur de données, si.
 *
 * L'effet sur un backtest n'est pas cosmétique. Le portefeuille est valorisé
 * chaque jour : un pic fantôme gonfle la valeur du jour, fausse la volatilité,
 * peut inventer un sommet dont la baisse maximale se mesurera ensuite, et
 * déclenche un rééquilibrage sur seuil qui n'aurait pas eu lieu.
 *
 * **Ce module ne corrige rien, il écarte.** Le point suspect est retiré, pas
 * remplacé par une valeur interpolée : la séance devient alors indistinguable
 * d'un jour non coté, cas que le calendrier sait déjà traiter en reportant la
 * veille. Inventer une valeur plausible reviendrait à fabriquer de la donnée,
 * ce qui est exactement ce qu'on reproche au relevé d'origine.
 *
 * La détection est **volontairement étroite**, parce qu'une règle trop large
 * effacerait de vrais krachs. Trois conditions cumulatives, et la troisième
 * fait tout le travail :
 *
 * 1. le mouvement d'entrée dépasse le seuil ;
 * 2. le mouvement de sortie le dépasse aussi, en sens inverse ;
 * 3. la veille et le lendemain se retrouvent au même niveau.
 *
 * C'est la troisième qui distingue l'erreur du marché : un vrai mouvement
 * s'installe, une erreur revient d'où elle vient. Vérifié sur les vraies
 * séances violentes du catalogue — le +22,8 % de `EEM` le 13 octobre 2008 et
 * le +16,8 % de `QQQ` le 3 janvier 2001 ne sont pas suivis d'un retour au
 * point de départ, et sont donc conservés.
 *
 * Les décalages **durables** ne relèvent pas de ce module : une division
 * d'actions non ajustée déplace le niveau sans retour, et se traite par la
 * donnée curatée `priceHistoryFrom`, qui écarte la portion antérieure.
 */

/** Amplitude minimale, à l'aller comme au retour, pour suspecter un relevé.
 *
 *  10 % en une séance est déjà exceptionnel pour un ETF diversifié : mars 2020
 *  n'a produit que trois journées au-delà sur ce catalogue, toutes durables. */
const SPIKE_THRESHOLD = 0.1;

/** Écart toléré entre la veille et le lendemain pour conclure au retour.
 *
 *  Non nul : un marché bouge aussi pendant l'incident. 3 % laisse passer cette
 *  variation normale sans risquer d'attraper un mouvement qui s'installe. */
const RETURN_TOLERANCE = 0.03;

export interface DespikeResult {
  points: PricePoint[];
  /** Dates écartées, pour le journal et les tests. */
  removed: string[];
}

export function despike(points: readonly PricePoint[]): DespikeResult {
  if (points.length < 3) return { points: [...points], removed: [] };

  const removed: string[] = [];
  const kept: PricePoint[] = [points[0]];

  for (let i = 1; i < points.length - 1; i += 1) {
    // La comparaison se fait au dernier point **conservé**, et non au voisin
    // d'origine : deux relevés faux consécutifs sont rarissimes, mais s'ils se
    // produisaient, comparer au précédent déjà écarté propagerait l'erreur.
    const before = kept[kept.length - 1].close;
    const current = points[i].close;
    const after = points[i + 1].close;

    if (before <= 0 || current <= 0 || after <= 0) {
      kept.push(points[i]);
      continue;
    }

    const inbound = current / before - 1;
    const outbound = after / current - 1;
    const across = Math.abs(after / before - 1);

    const isSpike =
      Math.abs(inbound) > SPIKE_THRESHOLD &&
      Math.abs(outbound) > SPIKE_THRESHOLD &&
      Math.sign(inbound) !== Math.sign(outbound) &&
      across < RETURN_TOLERANCE;

    if (isSpike) removed.push(points[i].date);
    else kept.push(points[i]);
  }

  kept.push(points[points.length - 1]);
  return { points: kept, removed };
}
