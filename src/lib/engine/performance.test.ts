import { describe, expect, it } from "vitest";

import {
  constantFx,
  makeAsset,
  makeInput,
  makeParams,
  makeSeries,
} from "@/test/fixtures/series";
import { DEFAULT_FEES } from "./fees";
import { runBacktest } from "./run-backtest";

/**
 * Garde-fou de performance.
 *
 * La décision de ne pas persister les séries quotidiennes repose entièrement
 * sur la rapidité du recalcul : les résultats sont redérivés à chaque
 * consultation depuis le cache de prix. Si ce test commence à échouer, ce n'est
 * pas le seuil qu'il faut relever — c'est la décision de stockage qu'il faut
 * rouvrir.
 */
describe("performance du moteur", () => {
  it("traite trente ans de données quotidiennes sur dix actifs en moins de trois secondes", () => {
    const days = 261 * 30;
    const assetCount = 10;

    const assets = Array.from({ length: assetCount }, (_, a) =>
      makeAsset(
        `A${a}`,
        // Trajectoires distinctes et volatiles, pour ne pas mesurer un cas
        // dégénéré que le moteur traverserait trop vite.
        makeSeries(
          "1996-01-01",
          days,
          (i) => 100 * (1 + 0.0003 * i) * (1 + 0.15 * Math.sin(i / (7 + a))),
        ),
        {
          targetWeight: 1 / assetCount,
          ter: 0.002 + a * 0.0001,
          // La moitié des actifs en devise, pour inclure le coût de conversion.
          currency: a % 2 === 0 ? "EUR" : "USD",
        },
      ),
    );

    const input = makeInput(
      assets,
      makeParams({
        initialAmount: 10_000,
        monthlyContribution: 500,
        years: 30,
        fees: DEFAULT_FEES,
        rebalancing: {
          period: "quarterly",
          thresholdEnabled: true,
          thresholdPoints: 5,
        },
      }),
      { fx: { USD: constantFx("1996-01-01", days, 0.9) } },
    );

    const startedAt = performance.now();
    const result = runBacktest(input);
    const elapsedMs = performance.now() - startedAt;

    expect(result.series.portfolio.length).toBeGreaterThan(7_000);
    expect(result.metrics.finalValue).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(3_000);
  });
});
