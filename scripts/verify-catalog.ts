import { config } from "dotenv";
import YahooFinance from "yahoo-finance2";

import { SEED_ASSETS } from "@/lib/db/seed/assets.seed";

config({ path: ".env.local", quiet: true });

/**
 * Confronte le catalogue curaté à Yahoo Finance.
 *
 * Les tickers, devises et dates de première cotation sont les seuls champs du
 * seed qu'une source automatique peut arbitrer — et ce sont ceux dont une erreur
 * casse un backtest sans prévenir (un actif coté en dollars déclaré en euros
 * produit une performance fausse mais plausible). L'éligibilité PEA, les TER et
 * les répartitions restent curatés et ne sont pas vérifiables ici.
 *
 * N'écrit rien : il rapporte, à lancer après toute modification du seed.
 */
async function main() {
  const yf = new YahooFinance({
    suppressNotices: ["yahooSurvey"],
    validation: { logErrors: false },
  });

  const problems: string[] = [];
  let checked = 0;

  for (const asset of SEED_ASSETS) {
    try {
      const chart = await yf.chart(asset.tickerYahoo, {
        period1: "2025-06-02",
        period2: "2025-06-10",
        interval: "1d",
      });
      const meta = chart.meta;
      checked += 1;

      if (meta.currency && meta.currency !== asset.currency) {
        problems.push(
          `${asset.tickerYahoo} : devise déclarée ${asset.currency}, Yahoo indique ${meta.currency}`,
        );
      }

      if (meta.firstTradeDate) {
        const yahooFirst = new Date(meta.firstTradeDate)
          .toISOString()
          .slice(0, 10);
        if (asset.inceptionDate && yahooFirst !== asset.inceptionDate) {
          problems.push(
            `${asset.tickerYahoo} : première cotation déclarée ${asset.inceptionDate}, Yahoo indique ${yahooFirst}`,
          );
        }
      }
    } catch (error) {
      problems.push(
        `${asset.tickerYahoo} : symbole injoignable — ${
          error instanceof Error ? error.message.slice(0, 100) : String(error)
        }`,
      );
    }
  }

  console.log(`${checked}/${SEED_ASSETS.length} symboles interrogés.`);

  if (problems.length === 0) {
    console.log("Catalogue cohérent avec Yahoo Finance.");
    return;
  }

  console.log(`\n${problems.length} écart(s) :`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Échec de la vérification :", error);
  process.exit(1);
});
