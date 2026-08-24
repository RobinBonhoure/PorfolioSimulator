/**
 * Clés de série partagées entre le calcul de comparaison et son graphique.
 *
 * Module volontairement vide de toute dépendance : `compare.ts` touche la base
 * et le moteur, et l'importer depuis un composant client ferait entrer tout cet
 * arbre dans le bundle du navigateur — le build échoue d'ailleurs franchement
 * là-dessus. Les types s'importent sans risque (ils s'effacent), une constante
 * non.
 */

/**
 * Courbe du capital versé, commune à tous les éléments comparés.
 *
 * Elle cohabite avec les identifiants d'éléments dans le même objet de série :
 * ceux-ci sont des UUID, la collision est donc impossible.
 */
export const INVESTED_KEY = "invested";
