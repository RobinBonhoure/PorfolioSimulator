/**
 * Formatage des nombres pour l'affichage.
 *
 * Tout passe par la locale française : séparateur de milliers en espace
 * insécable, virgule décimale. Les valeurs affichées dans des colonnes portent
 * en plus la classe `tnum` (chiffres à chasse fixe) pour que les unités
 * s'alignent verticalement.
 */

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurPreciseFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEur(value: number, precise = false): string {
  if (!Number.isFinite(value)) return "—";
  return precise ? eurPreciseFormatter.format(value) : eurFormatter.format(value);
}

/**
 * Montant abrégé pour les axes : « 5,8 M€ », « 231 k€ ».
 *
 * Une projection à trente ans traverse plusieurs ordres de grandeur ; écrire
 * « 5 820 355 € » sur une graduation force un axe démesurément large et rend
 * les étiquettes illisibles.
 */
export function formatEurCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const round = (x: number, digits: number) =>
    x.toLocaleString("fr-FR", { maximumFractionDigits: digits });

  if (abs >= 1_000_000) return `${sign}${round(abs / 1_000_000, 1)} M€`;
  if (abs >= 1_000) return `${sign}${round(abs / 1_000, abs >= 10_000 ? 0 : 1)} k€`;
  return `${sign}${round(abs, 0)} €`;
}

/** Montant signé : « +71 774 € », « −3 200 € ». */
export function formatSignedEur(value: number, precise = false): string {
  if (!Number.isFinite(value)) return "—";
  return value > 0 ? `+${formatEur(value, precise)}` : formatEur(value, precise);
}

/** Nombre simple en typographie française : 617,7 et non 617.7. */
export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Fraction vers pourcentage : 0,0638 → « 6,38 % ». */
export function formatPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

/** Pourcentage signé, pour les variations : « +6,38 % », « −12,10 % ». */
export function formatSignedPercent(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value, digits)}`;
}

export function formatRatio(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Date ISO vers « 12 mars 2020 ». */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Date ISO vers « 03/2020 », pour les axes de graphiques. */
export function formatMonthShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Durée en jours vers une formulation lisible. */
export function formatDuration(days: number | null): string {
  if (days === null) return "—";
  if (days < 60) return `${days} jours`;

  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} mois`;

  return `${(days / 365.25).toFixed(1).replace(".", ",")} ans`;
}
