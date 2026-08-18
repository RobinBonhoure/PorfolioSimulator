import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Régénère les jeux de données d'inflation depuis Eurostat.
 *
 * Ce script est **manuel** : l'indice des prix est mensuel et révisé rarement,
 * l'interroger à chaque backtest ajouterait une dépendance réseau et une
 * latence pour une donnée qui bouge douze fois par an. Le résultat est
 * versionné avec le code, ce qui rend les backtests reproductibles — deux
 * exécutions à six mois d'intervalle donnent le même rendement réel tant que le
 * fichier n'a pas changé.
 *
 * À relancer environ une fois par trimestre :
 *
 *     npx tsx scripts/update-inflation-data.ts
 *
 * Source : Eurostat `prc_hicp_midx`, indice des prix à la consommation
 * harmonisé, ensemble des postes (CP00), base 100 en 2015.
 */

const REGIONS = [
  { code: "FR", geo: "FR", label: "France" },
  { code: "EA", geo: "EA", label: "Zone euro" },
] as const;

const SINCE = "1996-01";

interface EurostatResponse {
  dimension: { time: { category: { index: Record<string, number> } } };
  value: Record<string, number>;
}

async function fetchRegion(geo: string) {
  const url =
    `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx` +
    `?format=JSON&unit=I15&coicop=CP00&geo=${geo}&sinceTimePeriod=${SINCE}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Eurostat a répondu ${response.status} pour ${geo}.`);
  }

  const payload = (await response.json()) as EurostatResponse;

  // Eurostat indexe les valeurs par position et non par période : il faut
  // inverser la table des périodes pour les rapprocher.
  const periodByPosition = new Map<number, string>();
  for (const [period, position] of Object.entries(
    payload.dimension.time.category.index,
  )) {
    periodByPosition.set(position, period);
  }

  const points: { period: string; hicpIndex: number }[] = [];
  for (const [position, value] of Object.entries(payload.value)) {
    const period = periodByPosition.get(Number(position));
    // Les mois sans observation publiée sont absents de `value` : on les saute
    // plutôt que d'interpoler une valeur que la source ne donne pas.
    if (!period || value === null || !Number.isFinite(value)) continue;
    points.push({ period: `${period}-01`, hicpIndex: value });
  }

  points.sort((a, b) => a.period.localeCompare(b.period));
  return points;
}

async function main() {
  const directory = join(process.cwd(), "src/lib/data-fetching/inflation");

  for (const region of REGIONS) {
    const points = await fetchRegion(region.geo);

    if (points.length < 100) {
      throw new Error(
        `Série ${region.code} anormalement courte (${points.length} points) : Eurostat a peut-être changé de format.`,
      );
    }

    const dataset = {
      source: "Eurostat prc_hicp_midx (CP00, base 100 = 2015)",
      region: region.code,
      label: region.label,
      generatedAt: new Date().toISOString().slice(0, 10),
      points,
    };

    const file = join(directory, `dataset-${region.code.toLowerCase()}.json`);
    await writeFile(file, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

    console.log(
      `${region.label.padEnd(12)} ${points.length} mois — ${points[0].period} → ${points.at(-1)!.period}`,
    );
  }
}

main().catch((error) => {
  console.error("Échec de la mise à jour :", error);
  process.exit(1);
});
