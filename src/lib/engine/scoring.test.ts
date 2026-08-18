import { describe, expect, it } from "vitest";

import { scoreMetric } from "./scoring";
import { METRIC_THRESHOLDS, type MetricKey } from "./thresholds";

describe("notation des métriques", () => {
  it("note un Sharpe selon les paliers documentés", () => {
    expect(scoreMetric("sharpe", -0.2).level).toBe(1);
    expect(scoreMetric("sharpe", 0.3).level).toBe(2);
    expect(scoreMetric("sharpe", 0.8).level).toBe(3);
    expect(scoreMetric("sharpe", 1.5).level).toBe(4);
    expect(scoreMetric("sharpe", 2.5).level).toBe(5);
  });

  it("inverse l'échelle pour les métriques où moins vaut mieux", () => {
    // Volatilité : 5 % est excellent, 40 % est le pire niveau.
    expect(scoreMetric("volatility", 0.05).level).toBe(5);
    expect(scoreMetric("volatility", 0.15).level).toBe(3);
    expect(scoreMetric("volatility", 0.4).level).toBe(1);
  });

  it("note une baisse maximale malgré ses bornes négatives", () => {
    expect(scoreMetric("maxDrawdown", -0.6).level).toBe(1);
    expect(scoreMetric("maxDrawdown", -0.4).level).toBe(2);
    expect(scoreMetric("maxDrawdown", -0.05).level).toBe(5);
  });

  it("ne note pas une métrique indéfinie", () => {
    const score = scoreMetric("sharpe", null);

    expect(score.level).toBeNull();
    expect(score.levelLabel).toBeNull();
    expect(score.value).toBeNull();
  });

  it("reste dans l'échelle aux valeurs extrêmes", () => {
    for (const key of Object.keys(METRIC_THRESHOLDS) as MetricKey[]) {
      for (const value of [-1e9, 1e9]) {
        const level = scoreMetric(key, value).level!;
        expect(level).toBeGreaterThanOrEqual(1);
        expect(level).toBeLessThanOrEqual(5);
      }
    }
  });

  it("associe à chaque niveau un libellé du vocabulaire de la métrique", () => {
    expect(scoreMetric("maxDrawdown", -0.6).levelLabel).toBe("Très risquée");
    expect(scoreMetric("volatility", 0.05).levelLabel).toBe("Très faible");
    expect(scoreMetric("cagr", 0.12).levelLabel).toBe("Excellent");
  });
});

describe("cohérence des seuils", () => {
  it("déclare quatre bornes strictement croissantes par métrique", () => {
    for (const [key, threshold] of Object.entries(METRIC_THRESHOLDS)) {
      expect(threshold.bounds, key).toHaveLength(4);
      for (let i = 1; i < threshold.bounds.length; i += 1) {
        expect(threshold.bounds[i], key).toBeGreaterThan(
          threshold.bounds[i - 1],
        );
      }
    }
  });

  it("fournit cinq libellés et le contenu pédagogique complet", () => {
    for (const [key, threshold] of Object.entries(METRIC_THRESHOLDS)) {
      expect(threshold.levelLabels, key).toHaveLength(5);
      expect(threshold.definition.length, key).toBeGreaterThan(20);
      expect(threshold.interpretation.length, key).toBeGreaterThan(20);
      expect(threshold.reference.length, key).toBeGreaterThan(10);
    }
  });
});
