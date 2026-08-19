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
 * Le contrôle porte sur la **série de cotations**, pas sur les métadonnées.
 * Yahoo continue de servir les métadonnées d'un support qui ne cote plus — nom,
 * devise, date de première cotation —, si bien qu'un fonds absorbé ou délisté
 * paraît parfaitement sain tant qu'on ne demande pas ses cours. C'est ainsi
 * qu'un ETF arrêté en 2022 est entré au catalogue sans être détecté.
 *
 * N'écrit rien : il rapporte, à lancer après toute modification du seed.
 */

/** Au-delà, on considère que le support ne cote plus. */
const MAX_STALENESS_DAYS = 10;

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
        period1: "1970-01-01",
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

      const quotes = (chart.quotes ?? []).filter((quote) => {
        const value = quote.adjclose ?? quote.close;
        return value !== null && value !== undefined && value > 0;
      });

      if (quotes.length === 0) {
        problems.push(`${asset.tickerYahoo} : aucune cotation exploitable`);
        continue;
      }

      const last = quotes[quotes.length - 1].date;
      const lastDate = last instanceof Date ? last : new Date(String(last));
      const staleDays = Math.floor(
        (Date.now() - lastDate.getTime()) / 86_400_000,
      );

      if (staleDays > MAX_STALENESS_DAYS) {
        problems.push(
          `${asset.tickerYahoo} : plus aucune cotation depuis ${lastDate
            .toISOString()
            .slice(0, 10)} (${staleDays} jours) — support probablement délisté ou absorbé`,
        );
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
