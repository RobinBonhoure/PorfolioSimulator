import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
    /** Donnée curatée : aucune API ne fournit l'éligibilité PEA.
     *  `null` signifie « inconnu » (actif ajouté hors catalogue). */
    peaEligible: boolean("pea_eligible"),
    /** Frais courants annuels en fraction (0.0038 = 0,38 %). */
    ter: numeric("ter", { precision: 8, scale: 6 }),
    currency: text("currency").notNull(),
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
