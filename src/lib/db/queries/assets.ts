import { eq, sql } from "drizzle-orm";

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
