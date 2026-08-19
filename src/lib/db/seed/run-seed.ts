import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assets, buildSearchText } from "@/lib/db/schema";
import { SEED_ASSETS } from "./assets.seed";

/**
 * Insère ou met à jour le catalogue d'actifs.
 *
 * Rejouable : chaque actif est identifié par son ticker Yahoo et fait l'objet
 * d'un upsert. Relancer le seed après avoir corrigé un TER met la valeur à jour
 * sans créer de doublon ni casser les stratégies qui référencent l'actif.
 *
 * Deux passes sont nécessaires : les proxys sont des actifs comme les autres, il
 * faut donc que toutes les lignes existent avant de pouvoir résoudre les
 * `proxyTicker` en identifiants.
 */
export async function seedAssets(): Promise<{
  upserted: number;
  proxiesLinked: number;
}> {
  let upserted = 0;

  for (const seed of SEED_ASSETS) {
    // `proxyTicker` est résolu à la seconde passe : il ne fait pas partie des
    // colonnes de la table.
    const { proxyTicker, ...row } = seed;
    const searchText = buildSearchText({
      name: row.name,
      shortLabel: row.shortLabel,
      isin: row.isin,
      tickerYahoo: row.tickerYahoo,
      aliases: row.aliases as string[] | undefined,
    });

    // Les colonnes mises à jour sont dérivées de l'objet du seed plutôt
    // qu'énumérées à la main. Une liste manuelle se désynchronise dès qu'on
    // ajoute un champ : la colonne s'insère correctement sur une base vide, et
    // reste silencieusement vide sur une base déjà peuplée — le seed annonce
    // alors « 38 actifs mis à jour » sans avoir écrit la nouvelle donnée.
    const values = { ...row, searchText };

    await db
      .insert(assets)
      .values(values)
      .onConflictDoUpdate({
        target: assets.tickerYahoo,
        set: { ...values, updatedAt: new Date() },
      });
    upserted += 1;
  }

  // Seconde passe : résolution des proxys, maintenant que tout existe.
  const rows = await db
    .select({ id: assets.id, tickerYahoo: assets.tickerYahoo })
    .from(assets);
  const idByTicker = new Map(rows.map((r) => [r.tickerYahoo, r.id]));

  let proxiesLinked = 0;
  for (const seed of SEED_ASSETS) {
    if (!seed.proxyTicker) continue;

    const proxyId = idByTicker.get(seed.proxyTicker);
    if (!proxyId) {
      throw new Error(
        `Proxy introuvable : ${seed.tickerYahoo} référence ${seed.proxyTicker}, absent du seed.`,
      );
    }

    await db
      .update(assets)
      .set({ proxyAssetId: proxyId })
      .where(eq(assets.tickerYahoo, seed.tickerYahoo));
    proxiesLinked += 1;
  }

  return { upserted, proxiesLinked };
}
