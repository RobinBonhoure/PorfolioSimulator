import type { LossReaction, Priority, WizardProfile } from "./profile";

/**
 * Traduction d'un profil en allocations chiffrées.
 *
 * Fonction pure et sans dépendance à la base : elle ne manipule que des tickers
 * et des pourcentages, ce qui la rend vérifiable à la main comme le moteur de
 * backtest. Toutes les valeurs de la table ci-dessous sont des choix explicites
 * et discutables, pas des constantes tombées du ciel — chacune porte sa
 * justification, parce qu'un pourcentage recommandé sans raison ne vaut pas
 * mieux qu'un pourcentage tiré au sort.
 *
 * Le principe : **l'horizon décide, le tempérament corrige.** L'horizon est le
 * seul paramètre dont la littérature financière tire une conclusion solide —
 * plus il est long, plus la probabilité qu'une poche actions termine en perte
 * s'effondre. Le tempérament ne change pas cette probabilité, il change la
 * probabilité que l'investisseur tienne : une allocation théoriquement optimale
 * qu'on liquide au pire moment est pire qu'une allocation prudente qu'on garde.
 */

/** Part actions de référence, en pourcentage, selon l'horizon en années.
 *
 *  Le palier à trois ans est un plancher dur et non un réglage : sur une durée
 *  aussi courte, une baisse de marché n'a pas le temps d'être effacée, et
 *  aucune tolérance au risque ne rend raisonnable d'y exposer un capital dont
 *  on a besoin. */
const EQUITY_BY_HORIZON: { maxYears: number; equity: number }[] = [
  { maxYears: 3, equity: 0 },
  { maxYears: 5, equity: 25 },
  { maxYears: 8, equity: 45 },
  { maxYears: 12, equity: 65 },
  { maxYears: 20, equity: 80 },
  { maxYears: Infinity, equity: 90 },
];

/** Correction en points de pourcentage selon la réaction à une baisse de 30 %. */
const TOLERANCE_ADJUSTMENT: Record<LossReaction, number> = {
  sell: -25,
  worry: -10,
  hold: 0,
  buy: +10,
};

/** Correction selon la priorité déclarée. La décorrélation ne déplace pas le
 *  curseur actions/obligations : elle agit sur la composition de chaque poche. */
const PRIORITY_ADJUSTMENT: Record<Priority, number> = {
  performance: +5,
  stability: -15,
  diversification: 0,
};

/** Écart entre les trois propositions, en points de part actions. */
const VARIANT_STEP = 15;

/**
 * Part actions maximale, tous profils confondus.
 *
 * Multiple de `VARIANT_STEP`, et ce n'est pas un hasard : le plafond est le seul
 * endroit où deux variantes peuvent se retrouver écartées de moins de quinze
 * points, ce qui casserait l'alignement des tranches de nommage et produirait
 * deux propositions homonymes. Accessoirement, un plafond à 95 % laissait une
 * poche obligataire de 5 % qui ne pesait rien et n'amortissait rien.
 */
const MAX_EQUITY = 90;

/** Part maximale d'une poche spéculative, en pourcentage du portefeuille.
 *
 *  Le plafond n'est pas une opinion sur le bitcoin : c'est la part au-delà de
 *  laquelle une ligne à 80 % de baisse maximale cesse d'être un complément pour
 *  devenir le principal déterminant du résultat. */
const CRYPTO_MAX = 5;
const GOLD_SHARE = 10;

/** Part actions minimale en deçà de laquelle une poche crypto n'a pas de sens :
 *  chercher un supplément de risque dans un portefeuille délibérément défensif
 *  est contradictoire. */
const CRYPTO_MIN_EQUITY = 60;

export interface RecommendedHolding {
  ticker: string;
  weightPercent: number;
}

export interface RecommendedStrategy {
  /** Stable et dérivé de la part actions, pour servir de clé de rendu. */
  id: string;
  /** Décrit l'allocation elle-même, pas son rang dans la liste : deux variantes
   *  peuvent fusionner, et la plus haute des deux restantes serait alors
   *  nommée « Équilibrée » tout en étant la plus offensive possible. */
  name: string;
  /** Ce que fait l'allocation et pourquoi elle découle des réponses données. */
  rationale: string;
  /** Part actions effective, arrondie. */
  equityShare: number;
  holdings: RecommendedHolding[];
}

/** Part actions de référence pour un profil, avant déclinaison en variantes. */
export function baseEquityShare(profile: WizardProfile): number {
  const byHorizon =
    EQUITY_BY_HORIZON.find((row) => profile.horizonYears <= row.maxYears)
      ?.equity ?? 0;

  // Sous trois ans, le plancher l'emporte sur tout le reste.
  if (byHorizon === 0) return 0;

  const adjusted =
    byHorizon +
    TOLERANCE_ADJUSTMENT[profile.lossReaction] +
    PRIORITY_ADJUSTMENT[profile.priority];

  return clamp(adjusted, 0, MAX_EQUITY);
}

/**
 * Trois allocations encadrant le profil : une cran en dessous, une centrée, une
 * cran au-dessus.
 *
 * Proposer trois options plutôt qu'une seule n'est pas une échappatoire. Le
 * curseur actions/obligations est le seul arbitrage qui compte vraiment, et
 * aucune réponse à un questionnaire ne le fixe au point de pourcentage près :
 * montrer l'encadrement et laisser choisir est plus honnête qu'afficher un
 * chiffre unique dont la précision serait feinte.
 */
export function recommendStrategies(
  profile: WizardProfile,
): RecommendedStrategy[] {
  const base = baseEquityShare(profile);

  // Le plafond d'horizon s'applique aussi aux variantes, et pas seulement à la
  // référence : sans lui, la variante haute rajouterait quinze points d'actions
  // sur un horizon d'un an, ce qui viderait le plancher de son sens.
  const ceiling = maxEquityForHorizon(profile.horizonYears);

  const shares = [base - VARIANT_STEP, base, base + VARIANT_STEP].map((share) =>
    clamp(share, 0, ceiling),
  );

  // Deux variantes ramenées à la même part actions produiraient deux fois la
  // même allocation sous deux noms différents. Sur un horizon court il ne reste
  // qu'une réponse sensée, et l'afficher seule est plus clair que de la
  // dupliquer en trois colonnes.
  const distinct = shares.filter(
    (share, index) => shares.indexOf(share) === index,
  );

  return distinct.map((equityShare) => ({
    id: `eq-${equityShare}`,
    name: nameForEquityShare(equityShare),
    equityShare,
    rationale: explain(profile, equityShare, base),
    holdings: buildHoldings(profile, equityShare),
  }));
}

/** Part actions maximale admise par le seul horizon, tempérament mis à part. */
function maxEquityForHorizon(horizonYears: number): number {
  return horizonYears <= 3 ? 0 : MAX_EQUITY;
}

/**
 * Nom décrivant le contenu de l'allocation.
 *
 * Les tranches font exactement `VARIANT_STEP` points et sont alignées sur ses
 * multiples. Ce n'est pas cosmétique : deux variantes distantes de quinze points
 * tombent alors nécessairement dans deux tranches différentes, ce qui interdit
 * par construction d'afficher deux propositions homonymes. Élargir une tranche
 * casserait cette garantie — le test la vérifie.
 */
function nameForEquityShare(equityShare: number): string {
  if (equityShare === 0) return "Sans actions";

  const names = [
    "Très défensive",
    "Défensive",
    "Prudente",
    "Modérée",
    "Équilibrée",
    "Dynamique",
  ];

  return names[Math.floor(equityShare / VARIANT_STEP)] ?? "Offensive";
}

// ---------------------------------------------------------------------------
// Composition des poches
// ---------------------------------------------------------------------------

function buildHoldings(
  profile: WizardProfile,
  equityShare: number,
): RecommendedHolding[] {
  const raw = new Map<string, number>();

  // Poches non corrélées prélevées sur la part actions : ce sont des actifs
  // risqués, les financer avec la poche obligataire dénaturerait le curseur.
  let remainingEquity = equityShare;

  if (profile.includeGold && equityShare > 0) {
    const gold = Math.min(GOLD_SHARE, remainingEquity);
    raw.set("GOLD.PA", gold);
    remainingEquity -= gold;
  }

  if (profile.includeCrypto && equityShare >= CRYPTO_MIN_EQUITY) {
    const crypto = Math.min(CRYPTO_MAX, remainingEquity);
    raw.set("BTC-EUR", crypto);
    remainingEquity -= crypto;
  }

  for (const [ticker, share] of equitySleeve(profile, remainingEquity)) {
    raw.set(ticker, (raw.get(ticker) ?? 0) + share);
  }
  for (const [ticker, share] of bondSleeve(profile, 100 - equityShare)) {
    raw.set(ticker, (raw.get(ticker) ?? 0) + share);
  }

  return normalise(raw);
}

/**
 * Répartition de la poche actions.
 *
 * Le socle est un ETF monde capitalisant à frais bas — c'est le point de départ
 * que rien ne bat de façon fiable. La déclinaison régionale n'est proposée qu'à
 * qui demande explicitement de la décorrélation : elle demande un suivi et un
 * rééquilibrage réels, et ne se justifie pas par défaut.
 */
function equitySleeve(
  profile: WizardProfile,
  total: number,
): [string, number][] {
  if (total <= 0) return [];

  if (profile.priority === "diversification") {
    return [
      ["WPEA.PA", total * 0.55],
      ["MEUD.PA", total * 0.2],
      ["PAEEM.PA", total * 0.15],
      ["PTPXE.PA", total * 0.1],
    ];
  }

  // Une part d'émergents reste utile même hors recherche de décorrélation :
  // un MSCI World seul ignore la Chine, l'Inde et Taïwan.
  return [
    ["WPEA.PA", total * 0.9],
    ["PAEEM.PA", total * 0.1],
  ];
}

/**
 * Répartition de la poche de taux.
 *
 * La duration suit l'horizon, et c'est le point important : en 2022, les
 * obligations d'État longues ont perdu 22 % quand le très court terme perdait
 * 4 %. Placer du long terme sur un horizon court reviendrait à réintroduire par
 * la poche « sûre » le risque qu'on vient de retirer de la poche actions.
 */
function bondSleeve(
  profile: WizardProfile,
  total: number,
): [string, number][] {
  if (total <= 0) return [];

  if (profile.horizonYears <= 3) {
    return [
      ["ERNE.AS", total * 0.7],
      ["IBGS.AS", total * 0.3],
    ];
  }

  if (profile.horizonYears <= 8 || profile.priority === "stability") {
    return [
      ["IBGS.AS", total * 0.5],
      ["EUNH.DE", total * 0.3],
      ["EUN5.DE", total * 0.2],
    ];
  }

  if (profile.priority === "diversification") {
    return [
      ["EUNH.DE", total * 0.4],
      ["EUN5.DE", total * 0.3],
      ["IBCI.DE", total * 0.3],
    ];
  }

  return [
    ["EUNH.DE", total * 0.6],
    ["EUN5.DE", total * 0.4],
  ];
}

// ---------------------------------------------------------------------------
// Rédaction et arrondis
// ---------------------------------------------------------------------------

function explain(
  profile: WizardProfile,
  equityShare: number,
  base: number,
): string {
  const parts: string[] = [];

  if (equityShare === 0) {
    parts.push(
      `Aucune action : vous avez besoin de cet argent dans ${profile.horizonYears} an${profile.horizonYears > 1 ? "s" : ""}, et une baisse de marché n'aurait pas le temps d'être effacée.`,
    );
  } else {
    parts.push(
      `${Math.round(equityShare)} % d'actions, ${100 - Math.round(equityShare)} % de taux.`,
    );
    parts.push(
      `Un horizon de ${profile.horizonYears} ans situe la référence à ${base} %`,
    );

    if (equityShare > base) {
      parts[parts.length - 1] +=
        ` ; cette variante monte au-dessus, donc des baisses plus profondes à traverser.`;
    } else if (equityShare < base) {
      parts[parts.length - 1] +=
        ` ; cette variante descend en dessous, donc un rendement attendu plus faible.`;
    } else {
      parts[parts.length - 1] += `, et c'est celle qui correspond à vos réponses.`;
    }
  }

  if (profile.lossReaction === "sell" && equityShare > 0) {
    parts.push(
      "La part actions est volontairement réduite : vous avez indiqué que vous vendriez après une baisse de 30 %, et une allocation qu'on liquide au creux vaut moins qu'une allocation modeste qu'on garde.",
    );
  }

  if (profile.priority === "diversification") {
    parts.push(
      "Les actions sont réparties par région plutôt que confiées à un seul indice mondial, et la poche de taux inclut des obligations indexées sur l'inflation.",
    );
  }

  if (profile.includeCrypto && equityShare < CRYPTO_MIN_EQUITY) {
    parts.push(
      `La poche crypto est écartée ici : sous ${CRYPTO_MIN_EQUITY} % d'actions, ajouter la ligne la plus volatile du catalogue contredirait l'objectif de la variante.`,
    );
  }

  return parts.join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Arrondit au centième et place le résidu sur la plus grosse ligne.
 *
 * Le formulaire exige une somme à 100 % au centième près. Arrondir chaque ligne
 * indépendamment laisse un écart de quelques centièmes qui bloquerait la
 * création — et le poser sur la plus grosse ligne le rend invisible, là où le
 * mettre sur la plus petite pourrait la faire passer de 5,00 à 5,03 %.
 */
function normalise(raw: Map<string, number>): RecommendedHolding[] {
  const entries = [...raw.entries()].filter(([, weight]) => weight > 0.005);
  if (entries.length === 0) return [];

  const rounded = entries.map(([ticker, weight]) => ({
    ticker,
    weightPercent: Math.round(weight * 100) / 100,
  }));

  const sum = rounded.reduce((total, h) => total + h.weightPercent, 0);
  const residual = Math.round((100 - sum) * 100) / 100;

  if (residual !== 0) {
    const largest = rounded.reduce((best, h) =>
      h.weightPercent > best.weightPercent ? h : best,
    );
    largest.weightPercent =
      Math.round((largest.weightPercent + residual) * 100) / 100;
  }

  return rounded.sort((a, b) => b.weightPercent - a.weightPercent);
}
