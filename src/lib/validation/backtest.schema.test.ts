import { describe, expect, it } from "vitest";

import { backtestRequestSchema } from "./backtest.schema";
import { DEFAULT_STRATEGY_FORM } from "./strategy.schema";
import { toEngineParams } from "./to-engine-params";

/**
 * Le brouillon est la seule voie par laquelle des paramètres de moteur arrivent
 * du navigateur sans transiter par la base. Ces tests décrivent ce qui doit
 * être refusé avant d'atteindre le moteur : rien de ce qui suit ne doit pouvoir
 * franchir la route.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const STRATEGY = "33333333-3333-4333-8333-333333333333";

const params = toEngineParams(DEFAULT_STRATEGY_FORM);

function request(overrides: Record<string, unknown> = {}) {
  return {
    strategyId: STRATEGY,
    youngAssetResolution: null,
    draft: {
      params,
      selection: [
        { assetId: A, targetWeight: 0.6 },
        { assetId: B, targetWeight: 0.4 },
      ],
      ...overrides,
    },
  };
}

describe("backtestRequestSchema", () => {
  it("accepte une requête sans brouillon", () => {
    const parsed = backtestRequestSchema.safeParse({ strategyId: STRATEGY });
    expect(parsed.success).toBe(true);
  });

  it("accepte un brouillon issu des valeurs par défaut du formulaire", () => {
    // Vérifie surtout que les deux schémas parlent bien la même unité : les
    // frais sortent de `toEngineParams` en fractions, et les bornes d'ici sont
    // exprimées en fractions elles aussi.
    expect(backtestRequestSchema.safeParse(request()).success).toBe(true);
  });

  it("refuse des poids qui ne somment pas à 100 %", () => {
    const parsed = backtestRequestSchema.safeParse(
      request({
        selection: [
          { assetId: A, targetWeight: 0.6 },
          { assetId: B, targetWeight: 0.5 },
        ],
      }),
    );

    expect(parsed.success).toBe(false);
  });

  it("refuse un actif répété", () => {
    const parsed = backtestRequestSchema.safeParse(
      request({
        selection: [
          { assetId: A, targetWeight: 0.5 },
          { assetId: A, targetWeight: 0.5 },
        ],
      }),
    );

    expect(parsed.success).toBe(false);
  });

  it("refuse une sélection vide", () => {
    expect(
      backtestRequestSchema.safeParse(request({ selection: [] })).success,
    ).toBe(false);
  });

  it("refuse un poids négatif", () => {
    const parsed = backtestRequestSchema.safeParse(
      request({
        selection: [
          { assetId: A, targetWeight: -0.5 },
          { assetId: B, targetWeight: 1.5 },
        ],
      }),
    );

    expect(parsed.success).toBe(false);
  });

  it("refuse une durée hors des bornes du formulaire", () => {
    expect(
      backtestRequestSchema.safeParse(
        request({ params: { ...params, years: 200 } }),
      ).success,
    ).toBe(false);
  });

  it("refuse des frais de courtage exprimés en pourcentage", () => {
    // 1,5 passerait pour « 1,5 % » côté formulaire, mais vaut 150 % en
    // fraction : la borne est ce qui empêche une erreur d'unité d'atteindre le
    // moteur, où elle liquiderait le portefeuille à chaque ordre.
    const parsed = backtestRequestSchema.safeParse(
      request({ params: { ...params, fees: { ...params.fees, brokeragePercent: 1.5 } } }),
    );

    expect(parsed.success).toBe(false);
  });

  it("refuse un identifiant de stratégie qui n'est pas un uuid", () => {
    expect(
      backtestRequestSchema.safeParse({ strategyId: "../../admin" }).success,
    ).toBe(false);
  });
});
