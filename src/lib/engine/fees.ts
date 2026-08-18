import type { FeesConfig } from "./types";

/**
 * Frais de transaction et frais courants.
 *
 * Trois postes, prélevés à des moments différents :
 *
 * - le **courtage** et le **spread** frappent chaque ordre, donc les versements
 *   comme les rééquilibrages — c'est ce qui rend un rééquilibrage mensuel plus
 *   coûteux qu'il n'y paraît ;
 * - le **TER** est prélevé quotidiennement sur l'encours, comme le font
 *   réellement les fonds, et non une fois par an.
 */

/** Aucun frais : sert au calcul parallèle qui mesure le coût des frais. */
export const ZERO_FEES: FeesConfig = {
  brokeragePercent: 0,
  brokerageMinEur: 0,
  spreadPercent: 0,
  applyTer: false,
};

/** Valeurs par défaut proposées dans l'éditeur, représentatives d'un courtier en ligne. */
export const DEFAULT_FEES: FeesConfig = {
  brokeragePercent: 0.001,
  brokerageMinEur: 0,
  spreadPercent: 0.001,
  applyTer: true,
};

export interface OrderCost {
  brokerage: number;
  spread: number;
  total: number;
}

/**
 * Coût d'un ordre d'un montant donné.
 *
 * Le plancher de courtage est borné par le montant de l'ordre : sans cela, un
 * versement mensuel de 20 € chez un courtier à 5 € minimum produirait un ordre
 * au coût supérieur au montant investi, et une valeur de portefeuille négative.
 * Le spread s'applique après le courtage, sur le montant réellement exécuté.
 */
export function orderCost(amount: number, fees: FeesConfig): OrderCost {
  if (amount <= 0) return { brokerage: 0, spread: 0, total: 0 };

  const brokerage = Math.min(
    Math.max(amount * fees.brokeragePercent, fees.brokerageMinEur),
    amount,
  );
  const spread = (amount - brokerage) * fees.spreadPercent;

  return { brokerage, spread, total: brokerage + spread };
}

/** Base de calcul du TER : jours calendaires, moyenne bissextiles comprises. */
const DAYS_PER_YEAR = 365.25;

/**
 * Facteur de décote du TER pour un nombre de jours écoulés.
 *
 * Le prorata se fait en **jours calendaires**, pas en jours de bourse. La
 * formule usuelle « TER / 252 par séance » suppose exactement 252 séances par
 * an ; notre calendrier en compte environ 261 (tous les jours de semaine, les
 * jours fériés locaux compris dès qu'une autre place cote), ce qui surfacturerait
 * les frais d'environ 3,5 % de leur montant. Prorater les jours réellement
 * écoulés fait tomber le coût annuel exactement sur le TER annoncé, et facture
 * correctement les week-ends et jours fériés — pendant lesquels un fonds
 * continue bel et bien de prélever ses frais de gestion.
 */
export function terFactorForElapsedDays(
  ter: number | null,
  fees: FeesConfig,
  elapsedDays: number,
): number {
  if (!fees.applyTer || !ter || elapsedDays <= 0) return 1;
  return 1 - (ter * elapsedDays) / DAYS_PER_YEAR;
}
