import type { CatalogAsset } from "@/lib/db/queries/assets";
import type { DiversifiableHolding } from "@/lib/diversification/types";

/**
 * Briques de construction du parcours de diversification.
 *
 * Le parcours ne compose pas une allocation à partir du catalogue entier : il
 * assemble une poignée de **rôles** — un socle, des compléments régionaux, une
 * poche de petites capitalisations — et choisit pour chacun le support le moins
 * cher qui le remplit dans l'enveloppe retenue. C'est ce qui permet de parler
 * de « marchés émergents » plutôt que de « PAEEM.PA » tant qu'on n'a pas
 * besoin du ticker.
 *
 * L'enveloppe n'est pas un détail de présentation, et c'est la raison pour
 * laquelle le parcours commence par elle. Deux rôles n'ont **aucun support
 * éligible au PEA** dans le catalogue : les petites capitalisations et le monde
 * hors États-Unis. Ce n'est pas une lacune du catalogue mais l'état du marché
 * français — un investisseur qui tient à son enveloppe fiscale ne peut pas
 * diversifier en taille, et il vaut mieux qu'il l'apprenne en construisant son
 * portefeuille qu'après. Le parcours le dit, propose de reconstituer
 * approximativement ce qui manque avec ce qui existe, et laisse arbitrer.
 */

export type Envelope = "pea" | "cto";

export const ENVELOPES: Record<
  Envelope,
  { label: string; hint: string }
> = {
  pea: {
    label: "PEA",
    hint: "Gains exonérés d'impôt sur le revenu après cinq ans, mais un univers de supports restreint.",
  },
  cto: {
    label: "Compte-titres",
    hint: "Tout l'univers des ETF européens, au prix du prélèvement forfaitaire de 30 %.",
  },
};

export type BrickId =
  | "world"
  | "allWorld"
  | "us"
  | "exUs"
  | "europe"
  | "japan"
  | "emerging"
  | "small";

export interface Brick {
  id: BrickId;
  label: string;
  /** Ce que la brique apporte, en une phrase. */
  hint: string;
  /** Support retenu par enveloppe. `null` : aucun éligible au catalogue. */
  ticker: Record<Envelope, string | null>;
}

export const BRICKS: Record<BrickId, Brick> = {
  world: {
    id: "world",
    label: "Monde développé",
    hint: "Vingt-trois pays développés, grandes et moyennes capitalisations. Le socle par défaut, et le plus américain.",
    // DCAM et IWDA répliquent le même indice à 0,20 % : le premier loge au PEA,
    // le second non.
    ticker: { pea: "DCAM.PA", cto: "IWDA.AS" },
  },
  allWorld: {
    id: "allWorld",
    label: "Monde entier, émergents compris",
    hint: "Le même socle, marchés émergents inclus dès le départ. Une seule ligne à tenir.",
    ticker: { pea: null, cto: "VWCE.DE" },
  },
  us: {
    id: "us",
    label: "États-Unis",
    hint: "Les cinq cents plus grandes capitalisations américaines.",
    ticker: { pea: "PE500.PA", cto: "PE500.PA" },
  },
  exUs: {
    id: "exUs",
    label: "Monde hors États-Unis",
    hint: "Tous les pays développés sauf les États-Unis, en une ligne.",
    ticker: { pea: null, cto: "EXUS.DE" },
  },
  europe: {
    id: "europe",
    label: "Europe",
    hint: "Six cents valeurs européennes, moyennes et petites comprises. Profil sectoriel opposé à celui des États-Unis.",
    ticker: { pea: "MEUD.PA", cto: "EXSA.DE" },
  },
  japan: {
    id: "japan",
    label: "Japon",
    hint: "Le marché qui rappelle qu'un pays peut mettre vingt ans à retrouver son sommet.",
    ticker: { pea: "PTPXE.PA", cto: "IJPA.AS" },
  },
  emerging: {
    id: "emerging",
    label: "Marchés émergents",
    hint: "Chine, Inde, Taïwan, Corée. Un tiers du PIB mondial, absent des indices « monde ».",
    ticker: { pea: "PAEEM.PA", cto: "EMIM.AS" },
  },
  small: {
    id: "small",
    label: "Petites capitalisations",
    hint: "Le septième du marché mondial qu'aucun indice standard ne contient.",
    ticker: { pea: null, cto: "IUSN.DE" },
  },
};

/** Socles proposés à l'étape de départ. */
export interface CoreOption {
  id: string;
  label: string;
  description: string;
  /** Ce que ce socle laisse dehors — le point que l'étape veut rendre visible. */
  blindSpot: string;
  /** Répartition interne du socle, en parts relatives. */
  parts: { brick: BrickId; share: number }[];
  /** Enveloppes où ce socle est constructible. */
  envelopes: Envelope[];
}

export const CORE_OPTIONS: CoreOption[] = [
  {
    id: "world",
    label: "Un ETF monde",
    description:
      "La solution la plus simple : une ligne, vingt-trois pays, à peu près tout ce qui compte parmi les grandes entreprises.",
    blindSpot:
      "Ni marchés émergents ni petites capitalisations, et près des trois quarts aux États-Unis.",
    parts: [{ brick: "world", share: 100 }],
    envelopes: ["pea", "cto"],
  },
  {
    id: "allWorld",
    label: "Un ETF monde entier",
    description:
      "Comme le précédent, mais les marchés émergents sont déjà dedans — une ligne de moins à gérer par la suite.",
    blindSpot:
      "Toujours aucune petite capitalisation, et la part américaine reste subie.",
    parts: [{ brick: "allWorld", share: 100 }],
    envelopes: ["cto"],
  },
  {
    id: "split",
    label: "États-Unis et reste du monde séparés",
    description:
      "Deux lignes au lieu d'une, et le poids des États-Unis devient un curseur au lieu d'être hérité de l'indice.",
    blindSpot:
      "Deux à trois lignes à rééquilibrer, et un écart au marché qu'il faut assumer dans les deux sens.",
    // En compte-titres, une seule ligne suffit pour tout ce qui n'est pas
    // américain. Au PEA, faute d'ETF « monde hors USA », on la reconstitue
    // avec l'Europe et le Japon — approximation assumée : il y manque le
    // Canada et l'Australie, soit environ un sixième de la zone.
    parts: [
      { brick: "us", share: 60 },
      { brick: "exUs", share: 40 },
    ],
    envelopes: ["pea", "cto"],
  },
];

/** Déclinaison PEA du socle « séparé », l'ETF monde hors USA n'y existant pas. */
const SPLIT_PEA_PARTS: { brick: BrickId; share: number }[] = [
  { brick: "us", share: 60 },
  { brick: "europe", share: 27 },
  { brick: "japan", share: 13 },
];

export function corePartsFor(
  core: CoreOption,
  envelope: Envelope,
): { brick: BrickId; share: number }[] {
  if (core.id === "split" && envelope === "pea") return SPLIT_PEA_PARTS;
  return core.parts;
}

/** Briques proposées comme compléments, dans l'ordre des étapes. */
export const REGION_BRICKS: BrickId[] = ["emerging", "europe", "japan"];
export const SIZE_BRICKS: BrickId[] = ["small"];

export interface Allocation {
  envelope: Envelope;
  coreId: string;
  /** Poids des compléments, en pourcentage du portefeuille. */
  satellites: Partial<Record<BrickId, number>>;
}

export const DEFAULT_ALLOCATION: Allocation = {
  envelope: "pea",
  coreId: "world",
  satellites: {},
};

/** Vrai si la brique existe dans l'enveloppe choisie. */
export function isAvailable(brick: BrickId, envelope: Envelope): boolean {
  return BRICKS[brick].ticker[envelope] !== null;
}

/**
 * Développe une allocation en lignes pondérées.
 *
 * Le socle absorbe ce que les compléments ne prennent pas — c'est la règle qui
 * garde le total à 100 % sans jamais demander à l'utilisateur de faire la
 * soustraction lui-même. Un curseur de complément retire donc mécaniquement du
 * socle, ce qui est aussi la bonne lecture financière : ajouter des émergents
 * n'ajoute pas d'argent, ça en déplace.
 */
export function expandAllocation(
  allocation: Allocation,
): { ticker: string; weightPercent: number }[] {
  const { envelope } = allocation;
  const core =
    CORE_OPTIONS.find((option) => option.id === allocation.coreId) ??
    CORE_OPTIONS[0];

  const satellites = Object.entries(allocation.satellites)
    .filter(([brick, weight]) => {
      return (
        (weight ?? 0) > 0 && isAvailable(brick as BrickId, envelope)
      );
    })
    .map(([brick, weight]) => ({ brick: brick as BrickId, weight: weight! }));

  const satelliteTotal = satellites.reduce((sum, s) => sum + s.weight, 0);
  const coreWeight = Math.max(0, 100 - satelliteTotal);

  const byTicker = new Map<string, number>();
  const add = (ticker: string | null, weight: number) => {
    if (!ticker || weight <= 0) return;
    byTicker.set(ticker, (byTicker.get(ticker) ?? 0) + weight);
  };

  const parts = corePartsFor(core, envelope);
  const partsTotal = parts.reduce((sum, part) => sum + part.share, 0);
  for (const part of parts) {
    add(
      BRICKS[part.brick].ticker[envelope],
      (coreWeight * part.share) / partsTotal,
    );
  }

  for (const satellite of satellites) {
    add(BRICKS[satellite.brick].ticker[envelope], satellite.weight);
  }

  return [...byTicker.entries()]
    .map(([ticker, weightPercent]) => ({ ticker, weightPercent }))
    .filter((line) => line.weightPercent > 0.05)
    .sort((a, b) => b.weightPercent - a.weightPercent);
}

/** Convertit une allocation développée en lignes analysables. */
export function toHoldings(
  lines: { ticker: string; weightPercent: number }[],
  catalog: readonly CatalogAsset[],
): DiversifiableHolding[] {
  const byTicker = new Map(catalog.map((asset) => [asset.tickerYahoo, asset]));

  return lines.flatMap((line) => {
    const asset = byTicker.get(line.ticker);
    if (!asset) return [];

    return [
      {
        id: asset.id,
        label: asset.shortLabel,
        weight: line.weightPercent / 100,
        assetClass: asset.assetClass,
        trackedIndex: asset.trackedIndex,
        ter: asset.ter === null ? null : Number(asset.ter),
        geoBreakdown: asset.geoBreakdown,
        sectorBreakdown: asset.sectorBreakdown,
        capBreakdown: asset.capBreakdown,
      },
    ];
  });
}
