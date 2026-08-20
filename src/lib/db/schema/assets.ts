import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const assetTypeEnum = pgEnum("asset_type", [
  "etf",
  "stock",
  "crypto",
  "metal",
]);

/**
 * Nature économique du sous-jacent, distincte de l'enveloppe du produit.
 *
 * `type` dit ce qu'on achète (un ETF, une action) ; `assetClass` dit à quoi on
 * est exposé. Les deux sont nécessaires et ne se déduisent pas l'un de l'autre :
 * un ETF actions et un ETF obligataire partagent le même `type` tout en ayant
 * des comportements opposés, et c'est cette distinction — pas la forme
 * juridique — qui commande la construction d'une allocation par niveau de
 * risque.
 */
export const assetClassEnum = pgEnum("asset_class", [
  "equity",
  "bond",
  "money_market",
  "commodity",
  "crypto",
]);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tickerYahoo: text("ticker_yahoo").notNull().unique(),
    isin: text("isin").unique(),
    /** Nom lisible complet : "Amundi MSCI World UCITS ETF". */
    name: text("name").notNull(),
    /** Étiquette compacte pour les listes denses : "MSCI World — CW8". */
    shortLabel: text("short_label").notNull(),
    /** Termes de recherche alternatifs : "world", "msci world", "cw8". */
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    type: assetTypeEnum("type").notNull(),
    /** `null` signifie « non classé » : c'est le cas des actifs ajoutés hors
     *  catalogue via la recherche Yahoo, dont on ignore la nature. Les
     *  allocations construites automatiquement les écartent plutôt que de leur
     *  prêter un comportement. */
    assetClass: assetClassEnum("asset_class"),
    /** Donnée curatée : aucune API ne fournit l'éligibilité PEA.
     *  `null` signifie « inconnu » (actif ajouté hors catalogue). */
    peaEligible: boolean("pea_eligible"),
    /** Frais courants annuels en fraction (0.0038 = 0,38 %). */
    ter: numeric("ter", { precision: 8, scale: 6 }),
    currency: text("currency").notNull(),
    /** Indice répliqué, pour les supports indiciels : « MSCI World », « S&P 500 ».
     *  `null` pour une action, une crypto ou un métal, qui ne suivent rien.
     *
     *  Sert à rapprocher les supports interchangeables. Trois ETF peuvent
     *  répliquer le même indice, être tous éligibles au PEA, et facturer du
     *  simple au double : c'est le seul arbitrage réellement à la main de
     *  l'investisseur, encore faut-il qu'il voie les trois côte à côte. */
    trackedIndex: text("tracked_index"),
    /** Volume moyen échangé sur trois mois, tel que publié par Yahoo.
     *
     *  Sert d'indicateur de liquidité au moment de départager deux supports
     *  répliquant le même indice. C'est une mesure grossière — elle ne porte que
     *  sur une place de cotation et ignore le carnet d'ordres — mais un écart
     *  d'un facteur cent entre deux lignes reste un signal réel. Rafraîchie par
     *  `scripts/refresh-liquidity.ts`, `null` tant qu'elle ne l'a pas été. */
    avgVolume: bigint("avg_volume", { mode: "number" }),
    /** Répartition sectorielle en pourcentages : { "Technologie": 24.5, ... }. */
    sectorBreakdown: jsonb("sector_breakdown").$type<Record<string, number>>(),
    geoBreakdown: jsonb("geo_breakdown").$type<Record<string, number>>(),
    inceptionDate: date("inception_date"),
    /** Actif plus ancien utilisé pour prolonger l'historique vers le passé.
     *  Référence un autre actif plutôt qu'un ticker libre : le proxy passe ainsi
     *  par le même cache de prix et la même logique de récupération. */
    proxyAssetId: uuid("proxy_asset_id").references(
      (): AnyPgColumn => assets.id,
      { onDelete: "set null" },
    ),
    /** Faux pour les actifs ajoutés par un utilisateur via la recherche Yahoo. */
    isCatalog: boolean("is_catalog").notNull().default(true),
    /** Vrai quand les répartitions sectorielle/géographique sont absentes. */
    dataPartial: boolean("data_partial").notNull().default(false),
    /** Texte concaténé alimentant l'index trigram de l'autocomplétion.
     *  Colonne ordinaire et non générée : PostgreSQL marque `array_to_string`
     *  comme STABLE (elle passe par la fonction de sortie du type, qui peut
     *  dépendre de réglages de session), et une colonne générée exige une
     *  expression IMMUTABLE. Plutôt que d'introduire une fonction SQL
     *  enrobante, la valeur est construite par `buildSearchText` à l'écriture —
     *  les seuls écrivains sont le seed et l'ajout d'actif hors catalogue. */
    searchText: text("search_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("assets_type_idx").on(table.type),
    index("assets_catalog_idx").on(table.isCatalog),
  ],
);

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

/**
 * Construit le texte indexé pour la recherche floue.
 *
 * À appeler à chaque écriture d'un actif : la colonne n'étant pas générée, rien
 * ne la met à jour automatiquement.
 */
export function buildSearchText(input: {
  name: string;
  shortLabel: string;
  isin?: string | null;
  tickerYahoo: string;
  aliases?: readonly string[];
}): string {
  return [
    input.name,
    input.shortLabel,
    input.isin ?? "",
    input.tickerYahoo,
    ...(input.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}
