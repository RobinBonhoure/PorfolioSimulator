import { describe, expect, it } from "vitest";

import { DEFAULT_STRATEGY_FORM, strategyFormSchema } from "./strategy.schema";
import { fromEngineParams, toEngineParams, toSelection } from "./to-engine-params";

const formWith = (assets: { assetId: string; weightPercent: number }[]) => ({
  ...DEFAULT_STRATEGY_FORM,
  name: "Test",
  assets,
});

const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

describe("conversion des pourcentages en fractions", () => {
  it("divise les frais par cent une seule fois", () => {
    const params = toEngineParams(
      formWith([{ assetId: uuid(1), weightPercent: 100 }]),
    );

    // 0,1 % saisi → 0,001 côté moteur.
    expect(params.fees.brokeragePercent).toBeCloseTo(0.001, 12);
    expect(params.fees.spreadPercent).toBeCloseTo(0.001, 12);
    // Le plancher est déjà en euros : il ne doit surtout pas être divisé.
    expect(params.fees.brokerageMinEur).toBe(
      DEFAULT_STRATEGY_FORM.fees.brokerageMinEur,
    );
    // Le seuil de dérive reste en points de pourcentage.
    expect(params.rebalancing.thresholdPoints).toBe(5);
  });

  it("fait l'aller-retour sans perte", () => {
    const form = formWith([{ assetId: uuid(1), weightPercent: 100 }]);
    const roundTripped = fromEngineParams(toEngineParams(form));

    expect(roundTripped.fees.brokeragePercent).toBeCloseTo(
      form.fees.brokeragePercent,
      12,
    );
    expect(roundTripped.years).toBe(form.years);
    expect(roundTripped.benchmark).toBe(form.benchmark);
  });
});

describe("normalisation des poids", () => {
  it("ramène une allocation en tiers à une somme exacte de 1", () => {
    const selection = toSelection(
      formWith([
        { assetId: uuid(1), weightPercent: 33.33 },
        { assetId: uuid(2), weightPercent: 33.33 },
        { assetId: uuid(3), weightPercent: 33.34 },
      ]),
    );

    const sum = selection.reduce((s, a) => s + a.targetWeight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("préserve les proportions relatives", () => {
    const selection = toSelection(
      formWith([
        { assetId: uuid(1), weightPercent: 60 },
        { assetId: uuid(2), weightPercent: 40 },
      ]),
    );

    expect(selection[0].targetWeight).toBeCloseTo(0.6, 12);
    expect(selection[1].targetWeight).toBeCloseTo(0.4, 12);
  });
});

describe("validation du formulaire", () => {
  it("refuse une somme de poids qui n'atteint pas 100 %", () => {
    const result = strategyFormSchema.safeParse(
      formWith([{ assetId: uuid(1), weightPercent: 90 }]),
    );

    expect(result.success).toBe(false);
  });

  it("accepte une allocation en tiers arrondie au centième", () => {
    const result = strategyFormSchema.safeParse(
      formWith([
        { assetId: uuid(1), weightPercent: 33.33 },
        { assetId: uuid(2), weightPercent: 33.33 },
        { assetId: uuid(3), weightPercent: 33.34 },
      ]),
    );

    expect(result.success).toBe(true);
  });

  it("refuse deux fois le même actif", () => {
    const result = strategyFormSchema.safeParse(
      formWith([
        { assetId: uuid(1), weightPercent: 50 },
        { assetId: uuid(1), weightPercent: 50 },
      ]),
    );

    expect(result.success).toBe(false);
  });

  it("refuse une stratégie sans aucun apport", () => {
    const result = strategyFormSchema.safeParse({
      ...formWith([{ assetId: uuid(1), weightPercent: 100 }]),
      initialAmount: 0,
      monthlyContribution: 0,
    });

    expect(result.success).toBe(false);
  });

  it("accepte un versement mensuel sans capital initial", () => {
    const result = strategyFormSchema.safeParse({
      ...formWith([{ assetId: uuid(1), weightPercent: 100 }]),
      initialAmount: 0,
      monthlyContribution: 200,
    });

    expect(result.success).toBe(true);
  });
});
