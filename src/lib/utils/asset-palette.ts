/**
 * Couleurs des actifs dans les graphiques.
 *
 * La couleur suit **l'actif**, jamais son rang dans une liste. Deux
 * conséquences, et ce sont les deux raisons d'être de ce module :
 *
 * - retirer un actif de l'allocation ne repeint pas les autres ;
 * - un même ETF garde sa couleur du donut d'allocation à la matrice de
 *   corrélation, en passant par l'écran de comparaison.
 *
 * L'ordre des huit teintes est fixe et ne doit pas être permuté : il a été
 * retenu parce qu'il satisfait les écarts minimaux de perception, y compris
 * pour les principales formes de daltonisme, sur fond clair comme sur fond
 * sombre. Au-delà de huit actifs, on ne fabrique pas de nouvelle teinte : les
 * suivants réutilisent la série, et c'est l'étiquette qui les distingue.
 */

/** Variables CSS définies dans `globals.css`, déclinées par thème. */
const SERIES_VARIABLES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const SERIES_COUNT = SERIES_VARIABLES.length;

/**
 * Attribue une couleur stable à chaque actif d'une allocation.
 *
 * L'attribution dépend de l'ordre d'affichage de la stratégie, qui est
 * persistant (`sortOrder`), et non de l'ordre d'arrivée des données.
 */
export function buildAssetPalette(
  assetIds: readonly string[],
): Map<string, string> {
  const palette = new Map<string, string>();

  assetIds.forEach((id, index) => {
    palette.set(id, SERIES_VARIABLES[index % SERIES_COUNT]);
  });

  return palette;
}

export function colorForIndex(index: number): string {
  return SERIES_VARIABLES[index % SERIES_COUNT];
}

/** Couleur du capital investi et du benchmark : volontairement neutres, pour
 *  qu'aucune ligne de référence ne se confonde avec un actif. */
export const REFERENCE_COLORS = {
  invested: "var(--muted-foreground)",
  benchmark: "var(--axis)",
} as const;

/**
 * Échelle divergente de la matrice de corrélation.
 *
 * Bleu pour les corrélations négatives, gris au voisinage de zéro, rouge pour
 * les corrélations positives. Le point neutre est bien un gris et non une
 * troisième teinte : c'est ce qui fait lire « rien » au milieu de l'échelle.
 * Le vert et le rouge de performance sont délibérément évités ici — une
 * corrélation élevée n'est ni une bonne ni une mauvaise nouvelle en soi.
 */
export function correlationColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  const intensity = Math.abs(clamped);

  if (intensity < 0.05) return "var(--muted)";

  // `color-mix` interpole dans l'espace du navigateur et respecte les
  // variables de thème : la même fonction fonctionne en clair et en sombre.
  const pole = clamped > 0 ? "var(--series-8)" : "var(--series-1)";
  return `color-mix(in oklab, ${pole} ${Math.round(intensity * 100)}%, var(--muted))`;
}

/** Couleur de la jauge d'un niveau de score, de 1 (faible) à 5 (excellent). */
export function scoreColor(level: number | null): string {
  if (level === null) return "var(--muted-foreground)";
  return `var(--score-${Math.min(5, Math.max(1, level))})`;
}
