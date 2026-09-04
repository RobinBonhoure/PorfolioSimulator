import {
  UNKNOWN_CATEGORY,
  aggregateBreakdown,
  type BreakdownSlice,
} from "@/lib/backtest/breakdowns";
import { levelFor } from "@/lib/engine/scoring";
import type { ScoreLevel } from "@/lib/engine/thresholds";
import {
  AXIS_ORDER,
  DIVERSIFICATION_AXES,
  type DiversificationAxisKey,
} from "./axes";
import { buildFindings } from "./findings";
import { worstOverlap } from "./overlap";
import type {
  AxisScore,
  DiversifiableHolding,
  DiversificationReport,
} from "./types";

/**
 * Analyse de robustesse d'une allocation.
 *
 * Pure et synchrone, sans base ni réseau : c'est ce qui permet au parcours de
 * construction de rendre son verdict à chaque mouvement de curseur, sans
 * attendre quoi que ce soit. Seule la corrélation échappe à cette règle — elle
 * se mesure sur des rendements passés, donc exige un backtest — et arrive par
 * paramètre quand elle est disponible.
 *
 * Chaque axe est calculé sur **l'assiette où la notion a un sens**, et pas
 * uniformément sur le portefeuille entier :
 *
 * - la **géographie** porte sur tout, obligations comprises : le risque pays
 *   d'une dette souveraine est aussi réel que celui d'une action ;
 * - le **secteur** et la **taille** ne portent que sur la poche actions, parce
 *   qu'une obligation d'État n'a ni l'un ni l'autre. Les y inclure ferait
 *   basculer un portefeuille équilibré en « non renseigné » majoritaire, et la
 *   note ne mesurerait plus que la part obligataire.
 */

/** Plus grosse part réelle d'une répartition, « non renseigné » exclu.
 *
 *  L'exclusion est nécessaire : sans elle, un portefeuille dont la moitié des
 *  supports sont hors catalogue verrait « Non renseigné » élu catégorie
 *  dominante, et l'axe noterait la qualité de la donnée au lieu de l'allocation.
 *  L'absence de donnée reste signalée, mais comme constat. */
function dominantSlice(slices: BreakdownSlice[]): BreakdownSlice | null {
  const real = slices.filter((slice) => slice.category !== UNKNOWN_CATEGORY);
  if (real.length === 0) return null;

  return real.reduce((best, slice) =>
    slice.percent > best.percent ? slice : best,
  );
}

function score(
  key: DiversificationAxisKey,
  value: number | null,
  detail: string | null,
): AxisScore {
  const threshold = DIVERSIFICATION_AXES[key];

  if (value === null || !Number.isFinite(value)) {
    return { key, value: null, level: null, levelLabel: null, threshold, detail };
  }

  const level: ScoreLevel = levelFor(value, threshold);
  return {
    key,
    value,
    level,
    levelLabel: threshold.levelLabels[level - 1],
    threshold,
    detail,
  };
}

/** Poids relatif de chaque ligne, renormalisé à 1. Les allocations arrivent
 *  parfois à 99,9 % ou 100,1 % selon les arrondis de saisie. */
function normalised(
  holdings: readonly DiversifiableHolding[],
): DiversifiableHolding[] {
  const total = holdings.reduce((sum, h) => sum + h.weight, 0);
  if (total <= 0) return [];
  return holdings.map((h) => ({ ...h, weight: h.weight / total }));
}

export function analyseDiversification(
  input: readonly DiversifiableHolding[],
  options: { correlation?: number | null } = {},
): DiversificationReport {
  const holdings = normalised(input);
  const equities = holdings.filter((h) => h.assetClass === "equity");

  const equityShare = equities.reduce((sum, h) => sum + h.weight, 0) * 100;

  const weighted = holdings.map((h) => ({ ...h, targetWeight: h.weight }));
  const weightedEquities = equities.map((h) => ({
    ...h,
    targetWeight: h.weight,
  }));

  const geo = dominantSlice(
    aggregateBreakdown(weighted, (h) => h.geoBreakdown),
  );
  const sector = dominantSlice(
    aggregateBreakdown(weightedEquities, (h) => h.sectorBreakdown),
  );

  // Moyennes et petites confondues : c'est l'écart au marché investissable qui
  // se mesure, et un indice standard les omet toutes les deux au même titre.
  const caps = aggregateBreakdown(weightedEquities, (h) => h.capBreakdown);
  const smallMid = caps
    .filter((slice) => slice.category === "Moyennes" || slice.category === "Petites")
    .reduce((sum, slice) => sum + slice.percent, 0);
  const capsKnown = caps.some((slice) => slice.category !== UNKNOWN_CATEGORY);

  const overlap = worstOverlap(holdings);

  const axes: AxisScore[] = [
    score("geography", geo?.percent ?? null, geo?.category ?? null),
    score("sector", sector?.percent ?? null, sector?.category ?? null),
    score(
      "size",
      equities.length > 0 && capsKnown ? smallMid : null,
      null,
    ),
    score(
      "overlap",
      // Une ligne unique n'a par définition rien à recouvrir : c'est zéro, pas
      // une absence de donnée. Le déclarer non calculable afficherait un axe
      // vide sur le portefeuille le plus simple qui soit.
      holdings.length < 2 ? 0 : overlap?.duplicated ?? 0,
      overlap ? `${overlap.a.label} et ${overlap.b.label}` : null,
    ),
    score(
      "correlation",
      options.correlation ?? null,
      options.correlation === undefined || options.correlation === null
        ? "Disponible après le backtest"
        : null,
    ),
  ].sort(
    (a, b) => AXIS_ORDER.indexOf(a.key) - AXIS_ORDER.indexOf(b.key),
  );

  return {
    axes,
    equityShare,
    findings: buildFindings({
      holdings,
      axes,
      overlap,
      dominantGeo: geo,
      dominantSector: sector,
    }),
  };
}
