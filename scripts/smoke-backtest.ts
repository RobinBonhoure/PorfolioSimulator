import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Backtest de bout en bout sur données réelles.
 *
 * Traverse toute la chaîne : catalogue en base, récupération Yahoo, cache des
 * cours et du change, puis moteur. C'est le contrôle que les tests unitaires ne
 * peuvent pas faire — ils tournent sur des séries synthétiques, et ne diraient
 * rien d'un ticker mal orthographié ou d'un taux de change inversé.
 *
 * Le portefeuille choisi est délibérément le pire cas : un ETF ancien en euros,
 * un ETF plus récent, et du bitcoin — ce qui déclenche à la fois la conversion
 * de change, l'alerte d'actif jeune et l'avertissement d'inéligibilité au PEA.
 */
async function main() {
  const { db } = await import("@/lib/db");
  const { assets } = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");
  const { prepareEngineInput } = await import("@/lib/backtest/prepare-input");
  const { runBacktest } = await import("@/lib/engine/run-backtest");
  const { DEFAULT_FEES } = await import("@/lib/engine/fees");
  const { scoreAllMetrics } = await import("@/lib/engine/scoring");

  const tickers = ["CW8.PA", "PE500.PA", "BTC-EUR"];
  const rows = await db
    .select()
    .from(assets)
    .where(inArray(assets.tickerYahoo, tickers));

  const byTicker = new Map(rows.map((r) => [r.tickerYahoo, r]));
  const weights: Record<string, number> = {
    "CW8.PA": 0.6,
    "PE500.PA": 0.3,
    "BTC-EUR": 0.1,
  };

  const selection = tickers.map((ticker) => {
    const asset = byTicker.get(ticker);
    if (!asset) throw new Error(`${ticker} absent du catalogue.`);
    return { assetId: asset.id, targetWeight: weights[ticker] };
  });

  console.log("Récupération des cours (premier passage : appels Yahoo)…");
  const startedFetch = Date.now();

  const prepared = await prepareEngineInput({
    selection,
    params: {
      initialAmount: 10_000,
      monthlyContribution: 300,
      years: 10,
      rebalancing: {
        period: "quarterly",
        thresholdEnabled: true,
        thresholdPoints: 5,
      },
      fees: DEFAULT_FEES,
      realReturns: false,
      taxation: true,
      benchmark: "CW8.PA",
      youngAssetResolution: "start-late",
    },
    benchmarkTicker: "CW8.PA",
  });

  console.log(`  terminé en ${((Date.now() - startedFetch) / 1000).toFixed(1)} s`);
  for (const warning of prepared.warnings) console.log(`  ⚠ ${warning}`);

  for (const asset of prepared.input.assets) {
    console.log(
      `  ${asset.label.padEnd(24)} ${String(asset.prices.length).padStart(6)} cotations` +
        `  ${asset.prices[0]?.date} → ${asset.prices.at(-1)?.date}  (${asset.currency})`,
    );
  }

  const startedRun = Date.now();
  const result = runBacktest(prepared.input);
  const runMs = Date.now() - startedRun;

  const eur = (v: number) =>
    v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
  const pct = (v: number) => (v * 100).toFixed(2) + " %";

  console.log(`\nMoteur exécuté en ${runMs} ms`);
  console.log(
    `Période        ${result.metrics.startDate} → ${result.metrics.endDate} ` +
      `(${result.metrics.effectiveYears.toFixed(1)} ans)`,
  );
  console.log(`Capital investi ${eur(result.metrics.totalInvested)}`);
  console.log(`Valeur finale   ${eur(result.metrics.finalValue)}`);
  console.log(`Gain            ${eur(result.metrics.totalGain)}`);
  console.log(
    `Frais           ${eur(result.metrics.fees.total)} ` +
      `(TER ${eur(result.metrics.fees.ter)}, courtage ${eur(result.metrics.fees.brokerage)}, ` +
      `spread ${eur(result.metrics.fees.spread)})`,
  );
  console.log(`Manque à gagner ${eur(result.metrics.feeImpact)}`);

  console.log("\nMétriques notées :");
  for (const score of scoreAllMetrics(result.metrics)) {
    const value =
      score.value === null
        ? "—"
        : score.threshold.format === "percent"
          ? pct(score.value)
          : score.value.toFixed(2);
    console.log(
      `  ${score.threshold.label.padEnd(26)} ${value.padStart(9)}  ` +
        `${"●".repeat(score.level ?? 0).padEnd(5, "○")}  ${score.levelLabel ?? "non défini"}`,
    );
  }

  if (result.metrics.drawdown.peakDate) {
    console.log(
      `\nPire baisse    ${pct(result.metrics.drawdown.maxDrawdown)} ` +
        `du ${result.metrics.drawdown.peakDate} au ${result.metrics.drawdown.troughDate}` +
        (result.metrics.drawdown.recoveryDate
          ? `, récupérée le ${result.metrics.drawdown.recoveryDate} ` +
            `(${result.metrics.drawdown.recoveryDays} jours)`
          : ", jamais récupérée sur la période"),
    );
  }

  if (result.metrics.taxation) {
    const tax = result.metrics.taxation;
    console.log(
      `\nNet d'impôt    PEA ${eur(tax.netValuePea)} · CTO ${eur(tax.netValueCto)}`,
    );
    if (!tax.peaEligible) {
      console.log(
        `  ⚠ Stratégie non éligible au PEA à cause de : ${tax.peaBlockingAssets.join(", ")}`,
      );
    }
  }

  if (result.youngAssets.length > 0) {
    console.log("\nActifs plus jeunes que la période demandée :");
    for (const young of result.youngAssets) {
      console.log(
        `  ${young.label} — première cotation le ${young.inceptionDate}` +
          (young.hasProxy ? " (proxy disponible)" : " (aucun proxy)"),
      );
    }
  }

  // --- Second scénario : le même portefeuille en mode proxy ------------------
  //
  // PE500 ne cote que depuis 2019 mais son proxy SPY remonte à 1993. Le raccord
  // doit rallonger la période sans introduire de saut de valeur : un facteur
  // d'échelle mal appliqué se verrait immédiatement sur la variation maximale.
  console.log("\n— Même portefeuille, historiques comblés par proxy —");

  const withProxy = await prepareEngineInput({
    selection,
    params: {
      initialAmount: 10_000,
      monthlyContribution: 300,
      years: 10,
      rebalancing: {
        period: "quarterly",
        thresholdEnabled: true,
        thresholdPoints: 5,
      },
      fees: DEFAULT_FEES,
      realReturns: false,
      taxation: false,
      benchmark: null,
      youngAssetResolution: "use-proxy",
    },
  });

  const proxied = runBacktest(withProxy.input);
  const values = proxied.series.portfolio.map((p) => p.value);
  const biggestDailyMove = values
    .slice(1)
    .reduce((max, v, i) => Math.max(max, Math.abs(v / values[i] - 1)), 0);
  const proxyDays = proxied.series.portfolio.filter((p) => p.hasProxyData).length;

  console.log(
    `Période        ${proxied.metrics.startDate} → ${proxied.metrics.endDate} ` +
      `(${proxied.metrics.effectiveYears.toFixed(1)} ans, ` +
      `dont ${proxyDays} séances valorisées par proxy)`,
  );
  console.log(`Valeur finale   ${eur(proxied.metrics.finalValue)}`);
  console.log(
    `Plus forte variation quotidienne ${pct(biggestDailyMove)} ` +
      `— un raccord de proxy raté produirait ici un écart aberrant.`,
  );
}

main().catch((error) => {
  console.error("\nÉchec :", error instanceof Error ? error.message : error);
  process.exit(1);
});
