"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { fetchDailyPrices } from "@/lib/data-fetching/yahoo/prices";
import { db } from "@/lib/db";
import { assets, buildSearchText, type Asset } from "@/lib/db/schema";
import type { ActionResult } from "./strategies";

const inputSchema = z.object({
  symbol: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
});

/** Type Yahoo vers catégorie du catalogue. */
function inferType(symbol: string, currency: string): Asset["type"] {
  if (/-(EUR|USD|GBP)$/i.test(symbol) && !symbol.includes(".")) return "crypto";
  if (/^(GC|SI|PL|PA)=F$/i.test(symbol)) return "metal";
  void currency;
  return "stock";
}

/**
 * Ajoute au catalogue un actif trouvé via la recherche Yahoo.
 *
 * L'actif est marqué `isCatalog: false` et `dataPartial: true`, et son
 * éligibilité PEA reste `null`. C'est une différence de nature avec les actifs
 * curatés, pas un simple manque de remplissage : personne n'a vérifié ces
 * données, et l'interface doit continuer à le dire partout où l'actif apparaît.
 *
 * L'appel à Yahoo sert à valider le symbole et à récupérer sa devise réelle
 * avant l'insertion — une devise erronée fausserait silencieusement tous les
 * backtests contenant cet actif.
 */
export async function addFallbackAsset(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<{ assetId: string }>> {
  await requireUser();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Symbole invalide." };
  }

  const { symbol, name } = parsed.data;

  const [existing] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.tickerYahoo, symbol))
    .limit(1);

  if (existing) return { ok: true, data: { assetId: existing.id } };

  try {
    // Une seule année suffit à confirmer que le symbole répond et à lire sa
    // devise ; l'historique complet sera récupéré au premier backtest.
    const probe = await fetchDailyPrices(
      symbol,
      new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10),
    );

    const shortLabel = name.length > 40 ? `${name.slice(0, 38)}…` : name;

    const [created] = await db
      .insert(assets)
      .values({
        tickerYahoo: symbol,
        isin: null,
        name,
        shortLabel,
        aliases: [symbol],
        type: inferType(symbol, probe.currency),
        peaEligible: null,
        ter: null,
        currency: probe.currency,
        sectorBreakdown: null,
        geoBreakdown: null,
        capBreakdown: null,
        inceptionDate: probe.firstTradeDate,
        isCatalog: false,
        dataPartial: true,
        searchText: buildSearchText({
          name,
          shortLabel,
          isin: null,
          tickerYahoo: symbol,
          aliases: [symbol],
        }),
      })
      .returning({ id: assets.id });

    return { ok: true, data: { assetId: created.id } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : `Impossible de récupérer les cours de ${symbol}.`,
    };
  }
}
