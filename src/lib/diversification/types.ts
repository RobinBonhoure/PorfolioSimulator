import type { ScoreLevel } from "@/lib/engine/thresholds";
import type { AxisThreshold, DiversificationAxisKey } from "./axes";

/**
 * Ligne de portefeuille telle que l'analyse de robustesse la voit.
 *
 * Type propre au module, et non un import du moteur ou de la base : l'analyse
 * doit tourner aussi bien sur une stratégie enregistrée que sur une allocation
 * en cours de construction dans le parcours guidé, qui n'existe nulle part
 * encore. Les deux appelants convertissent vers ce type ; le module ne connaît
 * ni l'un ni l'autre.
 */
export interface DiversifiableHolding {
  id: string;
  label: string;
  /** Poids cible, en fraction de 0 à 1. */
  weight: number;
  assetClass: string | null;
  /** Indice répliqué, quand il y en a un. Deux lignes qui partagent le même
   *  indice sont un doublon exact, détectable sans aucune estimation. */
  trackedIndex: string | null;
  /** Frais courants annuels en fraction, pour départager un doublon. */
  ter: number | null;
  geoBreakdown: Record<string, number> | null;
  sectorBreakdown: Record<string, number> | null;
  capBreakdown: Record<string, number> | null;
}

export interface AxisScore {
  key: DiversificationAxisKey;
  /** `null` quand l'axe n'est pas calculable — donnée absente, ou backtest
   *  pas encore lancé pour la corrélation. */
  value: number | null;
  level: ScoreLevel | null;
  levelLabel: string | null;
  threshold: AxisThreshold;
  /** Ce qui porte la valeur : le pays dominant, le couple le plus redondant.
   *  Sert à formuler le constat sans recalculer. */
  detail: string | null;
}

/** Gravité d'un constat. Trois niveaux suffisent : à corriger, à regarder,
 *  à savoir. Au-delà, la hiérarchie cesse d'être lisible. */
export type FindingSeverity = "high" | "medium" | "info";

export interface Finding {
  id: string;
  severity: FindingSeverity;
  /** Axe concerné, ou `null` pour un constat transversal (donnée manquante). */
  axis: DiversificationAxisKey | null;
  /** Le constat, chiffré. */
  title: string;
  /** Pourquoi c'est un problème — ou pourquoi ça n'en est pas forcément un. */
  detail: string;
  /** Ce qu'il y a à faire. Un constat sans suite n'est qu'un reproche. */
  action: string;
}

export interface DiversificationReport {
  axes: AxisScore[];
  findings: Finding[];
  /** Part actions du portefeuille, en pourcentage. */
  equityShare: number;
}
