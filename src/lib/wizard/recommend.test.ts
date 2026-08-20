import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILE, type WizardProfile } from "./profile";
import { baseEquityShare, recommendStrategies } from "./recommend";

const profile = (overrides: Partial<WizardProfile> = {}): WizardProfile => ({
  ...DEFAULT_PROFILE,
  ...overrides,
});

describe("baseEquityShare", () => {
  it("interdit les actions sous trois ans, quelle que soit la tolérance", () => {
    // Le plancher court terme est un plancher dur : même un profil qui
    // renforcerait après une baisse de 30 % n'a pas le temps de la traverser.
    expect(baseEquityShare(profile({ horizonYears: 2, lossReaction: "buy" }))).toBe(0);
    expect(baseEquityShare(profile({ horizonYears: 3, lossReaction: "buy" }))).toBe(0);
    expect(baseEquityShare(profile({ horizonYears: 4, lossReaction: "buy" }))).toBeGreaterThan(0);
  });

  it("augmente avec l'horizon", () => {
    const shares = [4, 7, 10, 15, 30].map((horizonYears) =>
      baseEquityShare(profile({ horizonYears, lossReaction: "hold", priority: "stability" })),
    );

    for (let i = 1; i < shares.length; i += 1) {
      expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1]);
    }
  });

  it("applique la correction de tempérament, à horizon égal", () => {
    const at = (lossReaction: WizardProfile["lossReaction"]) =>
      baseEquityShare(profile({ horizonYears: 15, lossReaction, priority: "diversification" }));

    // Référence 80 % à quinze ans, priorité neutre.
    expect(at("hold")).toBe(80);
    expect(at("sell")).toBe(55);
    expect(at("worry")).toBe(70);
    expect(at("buy")).toBe(90);
  });

  it("ne dépasse jamais 90 %", () => {
    expect(
      baseEquityShare(
        profile({ horizonYears: 40, lossReaction: "buy", priority: "performance" }),
      ),
    ).toBeLessThanOrEqual(90);
  });
});

describe("recommendStrategies", () => {
  it("renvoie trois variantes ordonnées par part actions croissante", () => {
    const [prudente, equilibree, dynamique] = recommendStrategies(
      profile({ horizonYears: 15 }),
    );

    expect(prudente.equityShare).toBeLessThan(equilibree.equityShare);
    expect(equilibree.equityShare).toBeLessThan(dynamique.equityShare);
  });

  it("produit des poids sommant exactement à 100 %", () => {
    // La contrainte du formulaire est un écart maximal d'un centième ; toute
    // allocation proposée doit donc pouvoir être créée sans retouche.
    const cases: Partial<WizardProfile>[] = [
      {},
      { horizonYears: 2 },
      { horizonYears: 5, priority: "stability" },
      { horizonYears: 30, priority: "diversification", includeGold: true },
      { horizonYears: 30, lossReaction: "buy", includeGold: true, includeCrypto: true },
      { horizonYears: 25, includeCrypto: true, priority: "diversification" },
      { horizonYears: 4, lossReaction: "sell", priority: "stability" },
    ];

    for (const overrides of cases) {
      for (const strategy of recommendStrategies(profile(overrides))) {
        const sum = strategy.holdings.reduce((t, h) => t + h.weightPercent, 0);
        expect(Math.abs(sum - 100), `${JSON.stringify(overrides)} / ${strategy.id}`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it("n'émet jamais de poids négatif ni de doublon", () => {
    for (const horizonYears of [1, 3, 6, 10, 18, 35]) {
      for (const strategy of recommendStrategies(
        profile({ horizonYears, includeGold: true, includeCrypto: true }),
      )) {
        const tickers = strategy.holdings.map((h) => h.ticker);
        expect(new Set(tickers).size).toBe(tickers.length);
        for (const holding of strategy.holdings) {
          expect(holding.weightPercent).toBeGreaterThan(0);
        }
      }
    }
  });

  it("place la poche de taux sur du très court terme quand l'horizon est court", () => {
    // Sous trois ans il n'y a qu'une proposition : la poche actions est nulle.
    const [seule] = recommendStrategies(profile({ horizonYears: 2 }));
    const tickers = seule.holdings.map((h) => h.ticker);

    expect(tickers).toContain("ERNE.AS");
    // Aucune obligation longue : c'est elle qui a perdu 22 % en 2022.
    expect(tickers).not.toContain("EUNH.DE");
    expect(tickers).not.toContain("WPEA.PA");
  });

  it("écarte la crypto des variantes trop défensives, même si elle est acceptée", () => {
    const strategies = recommendStrategies(
      profile({ horizonYears: 10, lossReaction: "worry", includeCrypto: true }),
    );

    const prudente = strategies[0];
    const dynamique = strategies[strategies.length - 1];

    expect(prudente.equityShare).toBeLessThan(60);
    expect(prudente.holdings.map((h) => h.ticker)).not.toContain("BTC-EUR");
    expect(dynamique.holdings.map((h) => h.ticker)).toContain("BTC-EUR");
  });

  it("plafonne la crypto à 5 % du portefeuille", () => {
    for (const strategy of recommendStrategies(
      profile({ horizonYears: 40, lossReaction: "buy", includeCrypto: true }),
    )) {
      const crypto = strategy.holdings.find((h) => h.ticker === "BTC-EUR");
      if (crypto) expect(crypto.weightPercent).toBeLessThanOrEqual(5);
    }
  });

  it("répartit les actions par région quand la décorrélation est demandée", () => {
    const [, simple] = recommendStrategies(
      profile({ horizonYears: 20, priority: "performance" }),
    );
    const [, diversifie] = recommendStrategies(
      profile({ horizonYears: 20, priority: "diversification" }),
    );

    expect(simple.holdings.length).toBeLessThan(diversifie.holdings.length);
    expect(diversifie.holdings.map((h) => h.ticker)).toContain("MEUD.PA");
  });

  it("n'expose aucune action sous trois ans, quelle que soit la variante", () => {
    const strategies = recommendStrategies(
      profile({ horizonYears: 1, lossReaction: "buy" }),
    );

    // Une seule proposition : décliner en prudente/équilibrée/dynamique
    // n'aurait aucun sens puisque les trois seraient identiques.
    expect(strategies).toHaveLength(1);
    expect(strategies[0].name).toBe("Sans actions");
    for (const strategy of strategies) {
      expect(strategy.equityShare).toBe(0);
      expect(strategy.holdings.map((h) => h.ticker)).not.toContain("WPEA.PA");
    }
  });

  it("ne propose jamais deux variantes identiques ni deux fois le même nom", () => {
    // Le second point tient à l'alignement des tranches de nommage sur le pas
    // de quinze points : élargir une tranche ferait réapparaître des doublons.
    for (const horizonYears of [1, 2, 3, 4, 6, 10, 18, 35]) {
      for (const lossReaction of ["sell", "worry", "hold", "buy"] as const) {
        for (const priority of ["performance", "stability", "diversification"] as const) {
          const context = `${horizonYears} ans / ${lossReaction} / ${priority}`;
          const strategies = recommendStrategies(
            profile({ horizonYears, lossReaction, priority }),
          );

          expect(strategies.length, context).toBeGreaterThan(0);

          const shares = strategies.map((s) => s.equityShare);
          expect(new Set(shares).size, context).toBe(shares.length);

          const names = strategies.map((s) => s.name);
          expect(new Set(names).size, context).toBe(names.length);
        }
      }
    }
  });
});
