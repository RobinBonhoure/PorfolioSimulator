import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, type Asset } from "@/lib/db/schema";

export interface AssetSearchResult {
  id: string;
  tickerYahoo: string;
  isin: string | null;
  name: string;
  shortLabel: string;
  type: Asset["type"];
  peaEligible: boolean | null;
  ter: string | null;
  currency: string;
  dataPartial: boolean;
}

/**
 * Recherche floue dans le catalogue.
 *
 * Deux mécanismes se complètent, et c'est délibéré : `ILIKE` attrape les
 * requêtes courtes et les identifiants exacts, là où la similarité trigram
 * s'effondre — « cw8 » ne fait que trois caractères, et un ISIN saisi
 * partiellement ne dépasse pas le seuil. La similarité, elle, rattrape les
 * fautes de frappe et les correspondances approximatives sur les noms longs.
 *
 * Le tri place d'abord les correspondances littérales, puis les approchantes,
 * pour qu'une saisie exacte ne se retrouve jamais derrière un rapprochement
 * flou.
 */
export async function searchAssets(
  query: string,
  limit = 10,
): Promise<AssetSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  type SearchRow = AssetSearchResult & { sim: number } & Record<string, unknown>;

  const rows = await db.execute<SearchRow>(sql`
    SELECT
      id,
      ticker_yahoo   AS "tickerYahoo",
      isin,
      name,
      short_label    AS "shortLabel",
      type,
      pea_eligible   AS "peaEligible",
      ter,
      currency,
      data_partial   AS "dataPartial",
      similarity(search_text, ${trimmed}) AS sim
    FROM assets
    WHERE is_catalog = true
      AND (
        search_text ILIKE ${"%" + trimmed + "%"}
        OR similarity(search_text, ${trimmed}) > 0.2
      )
    ORDER BY
      (search_text ILIKE ${"%" + trimmed + "%"}) DESC,
      similarity(search_text, ${trimmed}) DESC,
      name ASC
    LIMIT ${limit}
  `);

  // `sim` sert au tri côté SQL et n'a pas à remonter jusqu'à l'interface.
  return rows.rows.map(({ sim, ...row }) => row);
}

export interface CatalogAsset extends AssetSearchResult {
  /** Nature du sous-jacent : actions, obligations, monétaire, matière
   *  première, crypto. `null` pour un actif ajouté hors catalogue. */
  assetClass: Asset["assetClass"];
  /** Volume moyen sur trois mois, indicateur grossier de liquidité. */
  avgVolume: number | null;
  /** Indice répliqué, `null` pour une action, une crypto ou un métal. */
  trackedIndex: string | null;
  /** Zone géographique dominante, pour l'affichage seul. */
  topGeo: string | null;
  /** Secteur dominant, pour l'affichage seul. */
  topSector: string | null;
}

/** Catégorie la plus lourde d'une répartition. */
function dominantOf(breakdown: Record<string, number> | null): string | null {
  if (!breakdown) return null;

  let best: string | null = null;
  let bestValue = -1;
  for (const [category, value] of Object.entries(breakdown)) {
    if (value > bestValue) {
      best = category;
      bestValue = value;
    }
  }
  return best;
}

function toCatalogAsset(row: Asset): CatalogAsset {
  return {
    id: row.id,
    tickerYahoo: row.tickerYahoo,
    isin: row.isin,
    name: row.name,
    shortLabel: row.shortLabel,
    type: row.type,
    peaEligible: row.peaEligible,
    ter: row.ter,
    currency: row.currency,
    dataPartial: row.dataPartial,
    assetClass: row.assetClass,
    avgVolume: row.avgVolume,
    trackedIndex: row.trackedIndex,
    topGeo: dominantOf(row.geoBreakdown),
    topSector: dominantOf(row.sectorBreakdown),
  };
}

/**
 * Catalogue complet, pour la navigation par filtres.
 *
 * Chargé en une fois côté serveur et transmis à l'éditeur : trente-deux lignes
 * ne justifient ni pagination ni appel réseau supplémentaire, et l'utilisateur
 * obtient une liste immédiate plutôt qu'un état de chargement.
 *
 * `topGeo` et `topSector` sont calculés ici, mais destinés au seul affichage.
 * On ne filtre pas dessus : un ETF n'est pas *une* géographie, il en contient
 * une répartition — sur ce catalogue, neuf ETF sur dix sont à dominante
 * américaine, si bien qu'un filtre « États-Unis » n'écarterait qu'un seul
 * support. Ces valeurs situent un actif, elles ne le classent pas.
 */
export async function listCatalogAssets(): Promise<CatalogAsset[]> {
  const rows = await db
    .select()
    .from(assets)
    .where(eq(assets.isCatalog, true))
    .orderBy(asc(assets.type), asc(assets.shortLabel));

  return rows.map(toCatalogAsset);
}

/**
 * Actifs désignés par leur identifiant, catalogue ou non.
 *
 * Sert à afficher une sélection restaurée : un actif ajouté depuis Yahoo n'est
 * pas au catalogue, et le chercher dans la liste chargée pour la navigation le
 * ferait apparaître sans nom.
 */
export async function listAssetsByIds(
  ids: readonly string[],
): Promise<CatalogAsset[]> {
  if (ids.length === 0) return [];

  const rows = await db.select().from(assets).where(inArray(assets.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Réaligné sur l'ordre demandé : c'est lui qui fixe les couleurs et l'ordre
  // des colonnes de la comparaison.
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is Asset => row !== undefined)
    .map(toCatalogAsset);
}

/** Actifs d'une stratégie, proxy résolu, prêts à alimenter le moteur. */
export async function getAssetsByIds(ids: readonly string[]) {
  if (ids.length === 0) return [];

  return db.query.assets.findMany({
    where: (assets, { inArray }) => inArray(assets.id, [...ids]),
  });
}

export async function getAssetByTicker(ticker: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.tickerYahoo, ticker))
    .limit(1);
  return asset ?? null;
}
