import type { InflationPoint } from "@/lib/engine/types";
import datasetEa from "./dataset-ea.json";
import datasetFr from "./dataset-fr.json";

/**
 * Séries d'inflation, chargées depuis les fichiers versionnés.
 *
 * Import statique et non lecture disque : les données sont ainsi empaquetées
 * avec l'application, disponibles sans latence en environnement serverless, et
 * identiques d'un déploiement à l'autre.
 */

export type InflationRegion = "FR" | "EA";

interface InflationDataset {
  source: string;
  region: string;
  label: string;
  generatedAt: string;
  points: { period: string; hicpIndex: number }[];
}

const DATASETS: Record<InflationRegion, InflationDataset> = {
  FR: datasetFr as InflationDataset,
  EA: datasetEa as InflationDataset,
};

export function getInflationSeries(
  region: InflationRegion = "FR",
): InflationPoint[] {
  return DATASETS[region].points;
}

/** Dernier mois couvert par le jeu de données. */
export function inflationCoverageEnd(
  region: InflationRegion = "FR",
): string | null {
  return DATASETS[region].points.at(-1)?.period ?? null;
}

/**
 * Avertissement si la période demandée dépasse la couverture du jeu de données.
 *
 * Au-delà du dernier mois publié, le moteur reporte le dernier indice connu :
 * le rendement réel des mois récents est alors mécaniquement identique au
 * rendement nominal. Mieux vaut le dire que laisser croire à une inflation
 * nulle.
 */
export function inflationCoverageWarning(
  endDate: string,
  region: InflationRegion = "FR",
): string | null {
  const coverage = inflationCoverageEnd(region);
  if (!coverage || endDate.slice(0, 7) <= coverage.slice(0, 7)) return null;

  return (
    `Les données d'inflation s'arrêtent en ${coverage.slice(0, 7)} : ` +
    `au-delà, le rendement réel est calculé à inflation nulle. ` +
    `Relancez « npx tsx scripts/update-inflation-data.ts » pour les actualiser.`
  );
}
