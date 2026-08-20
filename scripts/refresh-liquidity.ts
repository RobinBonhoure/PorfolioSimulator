import { config } from "dotenv";
import { eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";

config({ path: ".env.local", quiet: true });

/**
 * Rafraîchit le volume moyen des actifs du catalogue.
 *
 * Le volume sert à départager deux supports répliquant le même indice, dans le
 * parcours guidé. C'est une mesure grossière — elle ne porte que sur une place
 * de cotation et ignore la fourchette du carnet d'ordres — mais un rapport de
 * un à cent entre deux lignes reste un signal réel sur la facilité à entrer et
 * à sortir.
 *
 * Script d'écriture, distinct de `verify-catalog.ts` qui, lui, ne fait que
 * rapporter. À relancer de temps à autre : la mesure porte sur trois mois
 * glissants et dérive lentement.
 */
async function main() {
  const { db } = await import("@/lib/db");
  const { assets } = await import("@/lib/db/schema");

  const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
    validation: { logErrors: false },
  });

  const rows = await db
    .select({ id: assets.id, ticker: assets.tickerYahoo })
    .from(assets)
    .where(eq(assets.isCatalog, true));

  let updated = 0;
  const missing: string[] = [];

  // `quote()` plutôt que `quoteSummary()` : il accepte un lot de symboles en un
  // seul appel, et surtout il expose le volume de façon fiable. Demander le
  // seul module `price` de `quoteSummary` renvoie un objet amputé de
  // `averageDailyVolume3Month` — le champ n'apparaît qu'en lui adjoignant
  // `summaryDetail`, ce qui n'est ni documenté ni évident à retrouver.
  const quotes = await yf.quote(rows.map((row) => row.ticker));
  const volumeByTicker = new Map(
    quotes.map((quote) => [quote.symbol, quote.averageDailyVolume3Month]),
  );

  for (const row of rows) {
    const volume = volumeByTicker.get(row.ticker);

    if (typeof volume !== "number" || !Number.isFinite(volume)) {
      missing.push(row.ticker);
      continue;
    }

    await db
      .update(assets)
      .set({ avgVolume: Math.round(volume), updatedAt: new Date() })
      .where(eq(assets.id, row.id));
    updated += 1;
  }

  console.log(`Volume moyen mis à jour pour ${updated} actif(s) sur ${rows.length}.`);
  if (missing.length > 0) {
    console.log(`Non renseigné pour : ${missing.join(", ")}`);
  }

  process.exit(0);
}

main();
