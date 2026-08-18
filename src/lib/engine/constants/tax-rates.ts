/**
 * Fiscalité française des plus-values de valeurs mobilières.
 *
 * La simulation est volontairement simple et ses hypothèses sont explicites,
 * parce qu'un chiffre net d'impôt inspire une confiance qu'il ne mérite que si
 * l'on sait ce qu'il suppose :
 *
 * - **PEA** : seuls les prélèvements sociaux s'appliquent, ce qui suppose un
 *   retrait après cinq ans de détention. Avant cinq ans, un retrait entraîne la
 *   clôture du plan et l'imposition au taux forfaitaire — cas non simulé, et
 *   signalé à l'utilisateur lorsque la durée du backtest est inférieure.
 * - **CTO** : prélèvement forfaitaire unique, qui agrège 12,8 % d'impôt sur le
 *   revenu et 17,2 % de prélèvements sociaux. L'option pour le barème
 *   progressif n'est pas simulée : elle dépend de la situation fiscale
 *   personnelle, hors du champ d'un backtest.
 *
 * Sont également hors champ : l'abattement pour durée de détention (supprimé
 * pour les titres acquis après 2018), l'imposition annuelle des dividendes en
 * CTO — les séries utilisées sont ajustées dividendes réinvestis, donc traitées
 * comme de la capitalisation — et l'IFI.
 *
 * Taux en vigueur en août 2026.
 */

/** Prélèvements sociaux sur les revenus du patrimoine. */
export const SOCIAL_CHARGES_RATE = 0.172;

/** Prélèvement forfaitaire unique, dit « flat tax ». */
export const FLAT_TAX_RATE = 0.3;

/** Durée de détention au-delà de laquelle un retrait de PEA échappe à l'impôt sur le revenu. */
export const PEA_TAX_FREE_YEARS = 5;
