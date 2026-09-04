/**
 * Catalogue d'actifs curaté.
 *
 * Trois natures de données cohabitent ici, avec des niveaux de confiance
 * différents qu'il faut garder à l'esprit en les modifiant :
 *
 * 1. **Vérifié auprès de Yahoo Finance** (août 2026) — `tickerYahoo`, `currency`
 *    et `inceptionDate`. Chaque symbole a été interrogé : la devise est celle de
 *    cotation réelle (attention, `GOLD.PA` cote en USD malgré sa place à Paris)
 *    et `inceptionDate` est la **première date de cotation disponible chez
 *    Yahoo**, pas la date légale de création du fonds. C'est bien cette date-là
 *    qui contraint un backtest, donc c'est elle qu'on stocke.
 *
 * 2. **Vérifié auprès de l'émetteur / justETF** (août 2026) — `isin` et `ter`
 *    des principaux ETF. Les TER bougent : BlackRock a abaissé celui de WPEA de
 *    0,25 % à 0,20 % fin 2025. Deux entrées portent un TER non confirmé,
 *    signalées en commentaire.
 *
 * 3. **Curaté à la main, indicatif** — `sectorBreakdown` et `geoBreakdown`. Ce
 *    sont des instantanés arrondis à la date ci-dessous, destinés à l'affichage
 *    des répartitions agrégées. Ils dérivent avec le temps et ne participent à
 *    aucun calcul de performance.
 *
 * `peaEligible` n'est disponible dans aucune API : c'est une donnée curatée
 * obligatoire, et c'est la raison d'être de ce fichier.
 */

import type { NewAsset } from "@/lib/db/schema";

/** Date de référence des répartitions sectorielles et géographiques. */
export const BREAKDOWN_REFERENCE_DATE = "2026-08";

export interface SeedAsset
  extends Omit<NewAsset, "id" | "searchText" | "proxyAssetId" | "createdAt" | "updatedAt"> {
  /** Ticker Yahoo de l'actif servant de proxy historique, résolu après insertion. */
  proxyTicker?: string;
}

// ---------------------------------------------------------------------------
// Actifs de proxy
//
// Séries plus anciennes utilisées pour prolonger l'historique d'un actif jeune
// vers le passé. `isCatalog: false` : ils ne remontent jamais dans
// l'autocomplétion, on ne les propose pas à l'investissement.
//
// Le meilleur proxy MSCI World disponible est CW8 lui-même (juin 2009), plus
// ancien que l'ETF américain URTH (2012) et déjà libellé en euros : il figure
// donc dans le catalogue et sert aussi de proxy.
// ---------------------------------------------------------------------------

const PROXY_ASSETS: SeedAsset[] = [
  {
    tickerYahoo: "SPY",
    isin: "US78462F1030",
    name: "SPDR S&P 500 ETF Trust",
    shortLabel: "S&P 500 — SPY (proxy)",
    aliases: ["sp500 proxy", "spy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "S&P 500",
    peaEligible: false,
    ter: "0.000945",
    currency: "USD",
    inceptionDate: "1993-01-29",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "EEM",
    isin: "US4642872349",
    name: "iShares MSCI Emerging Markets ETF",
    shortLabel: "Marchés émergents — EEM (proxy)",
    aliases: ["emerging proxy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Emerging Markets",
    peaEligible: false,
    ter: "0.0070",
    currency: "USD",
    inceptionDate: "2003-04-14",
    // Un relais qui a lui-même un relais, seul cas du catalogue. `EEM` est le
    // meilleur substitut des quatre ETF émergents — il réplique exactement leur
    // indice — mais il ne remonte qu'à avril 2003 et plafonnait donc à cette
    // date tout portefeuille en contenant une ligne. `VEIEX` prend le relais
    // au-delà : mesuré contre `EEM` sur les vingt-trois ans où les deux
    // existent, il donne 0,969 de corrélation pour 0,13 point de dérive. C'est
    // un mauvais substitut des ETF eux-mêmes — d'où son rejet à ce poste — et
    // un très bon substitut d'`EEM`, ce qui est exactement ce qu'on lui demande
    // ici. Une hypothèse a été écartée au passage : le reclassement de la Corée
    // du Sud par FTSE en 2009 n'explique pas l'écart, la corrélation valant
    // 0,967 avant et 0,969 après.
    proxyTicker: "VEIEX",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "QQQ",
    isin: "US46090E1038",
    name: "Invesco QQQ Trust",
    shortLabel: "Nasdaq 100 — QQQ (proxy)",
    aliases: ["nasdaq proxy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "Nasdaq / tech américaine",
    peaEligible: false,
    ter: "0.0020",
    currency: "USD",
    inceptionDate: "1999-03-10",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "VT",
    isin: "US9220427424",
    name: "Vanguard Total World Stock ETF",
    shortLabel: "Monde entier — VT (proxy)",
    aliases: ["all world proxy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "FTSE All-World",
    peaEligible: false,
    ter: "0.0006",
    currency: "USD",
    inceptionDate: "2008-06-26",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "GC=F",
    isin: null,
    name: "Contrat à terme sur l'or (COMEX)",
    shortLabel: "Or — GC=F (proxy)",
    aliases: ["gold proxy"],
    type: "metal",
    assetClass: "commodity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    inceptionDate: "2000-08-30",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "SI=F",
    isin: null,
    name: "Contrat à terme sur l'argent (COMEX)",
    shortLabel: "Argent — SI=F (proxy)",
    aliases: ["silver proxy"],
    type: "metal",
    assetClass: "commodity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    inceptionDate: "2000-08-30",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "EWJ",
    isin: "US4642868487",
    name: "iShares MSCI Japan ETF",
    shortLabel: "Japon — EWJ (proxy)",
    aliases: ["japan proxy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Japan",
    peaEligible: false,
    ter: "0.0050",
    currency: "USD",
    inceptionDate: "1996-03-18",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "VEU",
    isin: "US9220427762",
    name: "Vanguard FTSE All-World ex-US ETF",
    shortLabel: "Monde hors USA — VEU (proxy)",
    aliases: ["world ex us proxy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "FTSE All-World ex US",
    peaEligible: false,
    ter: "0.0004",
    currency: "USD",
    inceptionDate: "2007-03-08",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "IWM",
    isin: "US4642876555",
    name: "iShares Russell 2000 ETF",
    shortLabel: "Petites capitalisations — IWM (proxy)",
    aliases: ["small cap proxy"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "Russell 2000",
    peaEligible: false,
    ter: "0.0019",
    currency: "USD",
    inceptionDate: "2000-05-26",
    isCatalog: false,
    dataPartial: true,
  },

  // --- Proxys de profondeur ------------------------------------------------
  //
  // Ajoutés pour repousser le début des backtests. Deux familles :
  //
  // `WLD.PA` est un ETF MSCI World coté à Paris **en euros**, dix-huit mois
  // plus ancien que CW8. Sa devise compte autant que son antériorité : une
  // série en euros échappe entièrement au plafond du change.
  //
  // Les deux autres sont des **fonds indiciels Vanguard**. Pourquoi pas les
  // indices eux-mêmes, qui remontent bien plus loin : un indice de prix comme
  // `^GSPC` couvre 1927 mais exclut les dividendes, et l'écart mesuré sur
  // 1988-2026 atteint 2,30 points par an — un capital final sous-estimé d'un
  // facteur 2,2. Les versions rendement total existent mais Yahoo les sert mal
  // (`^SP500TR` démarre en 1988, `^RUTTR` en 1995, `^SXXR` pas du tout), et
  // sont de toute façon plus courtes que les fonds. La valeur liquidative
  // ajustée d'un fonds indiciel réinvestit les dividendes et remonte plus loin.
  // Contrepartie assumée : elle est nette des frais du fonds, que le moteur
  // recompte ensuite avec le TER de l'ETF cible — environ 0,14 point par an de
  // double comptage sur les seules années de proxy, négligeable devant les
  // 2,30 points d'un indice de prix.
  //
  // Deux candidats ont été essayés puis **écartés sur mesure**, et c'est la
  // raison d'être de `scripts/verify-proxies.ts` : `VEIEX` pour les marchés
  // émergents et `NAESX` pour les petites capitalisations. Tous deux gagnaient
  // en profondeur et perdaient en fidélité — sur les quatre ETF émergents,
  // `EEM` réplique exactement leur indice et ressort à 0,96-0,98 de corrélation
  // quand `VEIEX` plafonne à 0,93-0,95. La règle qui s'en dégage : à écart de
  // fidélité comparable on prend le plus profond, mais un indice différent ne
  // se rattrape jamais par de l'antériorité.
  //
  // `VEIEX` a toutefois retrouvé un emploi, un cran plus bas : il prolonge non
  // pas les ETF mais `EEM` lui-même, au-delà d'avril 2003 où celui-ci s'arrête.
  // C'est le seul endroit du catalogue où un relais en a un autre, et la règle
  // ci-dessus y est respectée plutôt que contournée : le substitut fidèle sert
  // partout où il existe, l'approximation ne couvre que la portion où plus rien
  // d'autre n'existe.
  {
    tickerYahoo: "WLD.PA",
    isin: "FR0010315770",
    name: "Amundi MSCI World UCITS ETF Acc",
    shortLabel: "MSCI World — WLD (proxy)",
    aliases: ["world proxy", "wld"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI World",
    peaEligible: true,
    ter: "0.0038",
    currency: "EUR",
    inceptionDate: "2008-01-01",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "VEIEX",
    isin: null,
    name: "Vanguard Emerging Markets Stock Index Fund Investor Shares",
    shortLabel: "Émergents — VEIEX (proxy de second rang)",
    aliases: ["emergents proxy", "veiex"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "FTSE Emerging Markets",
    peaEligible: false,
    ter: "0.0028",
    currency: "USD",
    inceptionDate: "1994-05-04",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "VEURX",
    isin: null,
    name: "Vanguard European Stock Index Fund Investor Shares",
    shortLabel: "Europe — VEURX (proxy)",
    aliases: ["europe proxy", "veurx"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "FTSE Developed Europe",
    peaEligible: false,
    ter: "0.0016",
    currency: "USD",
    inceptionDate: "1990-06-18",
    isCatalog: false,
    dataPartial: true,
  },
  {
    tickerYahoo: "VGTSX",
    isin: null,
    name: "Vanguard Total International Stock Index Fund Investor Shares",
    shortLabel: "Monde hors USA — VGTSX (proxy)",
    aliases: ["monde hors usa proxy", "vgtsx"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "FTSE Global All Cap ex US",
    peaEligible: false,
    ter: "0.0017",
    currency: "USD",
    inceptionDate: "1996-04-29",
    isCatalog: false,
    dataPartial: true,
  },
];

// ---------------------------------------------------------------------------
// Répartitions de référence, partagées entre ETF suivant le même indice.
// Pourcentages, somme = 100.
// ---------------------------------------------------------------------------

const MSCI_WORLD_SECTORS = {
  Technologie: 26,
  Finance: 16,
  Industrie: 11,
  Santé: 10,
  "Consommation discrétionnaire": 10,
  Communication: 9,
  "Consommation de base": 6,
  Énergie: 4,
  Matériaux: 3,
  "Services aux collectivités": 3,
  Immobilier: 2,
};

const MSCI_WORLD_GEO = {
  "États-Unis": 72,
  Japon: 5.5,
  "Royaume-Uni": 3.7,
  Canada: 3.2,
  France: 2.7,
  Suisse: 2.5,
  Allemagne: 2.4,
  Australie: 1.7,
  "Pays-Bas": 1.2,
  Autres: 5.1,
};

const SP500_SECTORS = {
  Technologie: 32,
  Finance: 14,
  Santé: 10,
  "Consommation discrétionnaire": 10,
  Communication: 9,
  Industrie: 8,
  "Consommation de base": 6,
  Énergie: 3,
  Matériaux: 3,
  "Services aux collectivités": 3,
  Immobilier: 2,
};

const SP500_GEO = { "États-Unis": 100 };

const EM_SECTORS = {
  Technologie: 24,
  Finance: 22,
  "Consommation discrétionnaire": 13,
  Communication: 10,
  Industrie: 7,
  Matériaux: 6,
  "Consommation de base": 5,
  Énergie: 5,
  Santé: 3,
  "Services aux collectivités": 3,
  Immobilier: 2,
};

const EM_GEO = {
  Chine: 27,
  Inde: 19,
  Taïwan: 19,
  "Corée du Sud": 10,
  Brésil: 4,
  "Arabie saoudite": 4,
  "Afrique du Sud": 3,
  Mexique: 2,
  Autres: 12,
};

const ALL_WORLD_GEO = {
  "États-Unis": 63,
  Japon: 5.5,
  "Royaume-Uni": 3.4,
  Chine: 3.3,
  Canada: 2.7,
  "Taïwan": 2.3,
  Inde: 2.3,
  France: 2.3,
  Suisse: 2.1,
  Allemagne: 2.1,
  Autres: 11,
};

const US_TECH_SECTORS = {
  Technologie: 60,
  Communication: 15,
  "Consommation discrétionnaire": 13,
  Santé: 5,
  "Consommation de base": 4,
  Industrie: 3,
};

const US_TECH_GEO = { "États-Unis": 97, Autres: 3 };

// --- Europe ----------------------------------------------------------------
// Le profil sectoriel européen est l'inverse de l'américain : beaucoup de
// finance, d'industrie et de santé, peu de technologie. C'est précisément ce
// qui en fait un complément et non un doublon d'un ETF World.

const EUROPE_SECTORS = {
  Finance: 20,
  Industrie: 17,
  Santé: 14,
  "Consommation discrétionnaire": 11,
  "Consommation de base": 9,
  Technologie: 8,
  Matériaux: 6,
  Énergie: 5,
  "Services aux collectivités": 5,
  Communication: 4,
  Immobilier: 1,
};

const EUROPE_GEO = {
  "Royaume-Uni": 22,
  France: 17,
  Allemagne: 15,
  Suisse: 14,
  "Pays-Bas": 7,
  Suède: 5,
  Italie: 5,
  Espagne: 5,
  Danemark: 4,
  Autres: 6,
};

/** Zone euro : ni Royaume-Uni ni Suisse, d'où une concentration bien plus forte. */
const EUROZONE_SECTORS = {
  Technologie: 18,
  Finance: 18,
  "Consommation discrétionnaire": 16,
  Industrie: 15,
  Santé: 9,
  "Consommation de base": 7,
  "Services aux collectivités": 7,
  Énergie: 5,
  Matériaux: 3,
  Communication: 2,
};

const EUROZONE_GEO = {
  France: 36,
  Allemagne: 32,
  "Pays-Bas": 13,
  Espagne: 8,
  Italie: 8,
  Irlande: 2,
  Belgique: 1,
};

const CAC40_SECTORS = {
  "Consommation discrétionnaire": 24,
  Industrie: 20,
  Finance: 15,
  Santé: 11,
  Énergie: 9,
  Technologie: 8,
  "Consommation de base": 6,
  Matériaux: 4,
  "Services aux collectivités": 3,
};

// --- Asie et émergents -----------------------------------------------------

const EM_ASIA_SECTORS = {
  Technologie: 30,
  Finance: 20,
  "Consommation discrétionnaire": 14,
  Communication: 10,
  Industrie: 8,
  Matériaux: 5,
  "Consommation de base": 5,
  Santé: 4,
  "Services aux collectivités": 2,
  Énergie: 2,
};

const EM_ASIA_GEO = {
  Chine: 37,
  Taïwan: 26,
  Inde: 25,
  "Corée du Sud": 9,
  Autres: 3,
};

const JAPAN_SECTORS = {
  Industrie: 23,
  "Consommation discrétionnaire": 19,
  Technologie: 15,
  Finance: 13,
  Santé: 8,
  "Consommation de base": 7,
  Communication: 7,
  Matériaux: 5,
  "Services aux collectivités": 2,
  Immobilier: 1,
};

const JAPAN_GEO = { Japon: 100 };

// --- Compléments d'un portefeuille mondial ---------------------------------

const WORLD_EX_US_SECTORS = {
  Finance: 22,
  Industrie: 18,
  "Consommation discrétionnaire": 11,
  Santé: 10,
  Technologie: 9,
  "Consommation de base": 8,
  Matériaux: 7,
  Énergie: 5,
  Communication: 5,
  "Services aux collectivités": 4,
  Immobilier: 1,
};

const WORLD_EX_US_GEO = {
  Japon: 21,
  "Royaume-Uni": 13,
  Canada: 11,
  France: 9,
  Suisse: 9,
  Allemagne: 8,
  Australie: 6,
  "Pays-Bas": 4,
  Suède: 3,
  Autres: 16,
};

const SMALL_CAP_SECTORS = {
  Industrie: 21,
  Finance: 17,
  "Consommation discrétionnaire": 14,
  Technologie: 12,
  Santé: 10,
  Immobilier: 8,
  Matériaux: 7,
  "Consommation de base": 5,
  Énergie: 4,
  "Services aux collectivités": 2,
};

const SMALL_CAP_GEO = {
  "États-Unis": 60,
  Japon: 11,
  "Royaume-Uni": 6,
  Canada: 5,
  Australie: 3,
  Allemagne: 2,
  Autres: 13,
};

// --- Tailles de capitalisation ---------------------------------------------
//
// La taille n'est pas une nuance de style : c'est la diversification que les
// indices grand public omettent en silence. Un MSCI World s'annonce comme « le
// monde » alors qu'il s'arrête, par construction, aux grandes et moyennes
// capitalisations — les petites, soit environ 14 % de la capitalisation
// mondiale investissable, en sont absentes. Aucun écran ne le dit à
// l'investisseur, d'où ces décompositions.
//
// Découpage retenu : la frontière MSCI, qui range dans « Grandes » les 70 %
// supérieurs de la capitalisation de chaque marché, dans « Moyennes » les 15
// points suivants et dans « Petites » les 15 derniers. Les chiffres ci-dessous
// sont des instantanés arrondis, au même titre indicatif que les répartitions
// sectorielles.

/** Indices « standard » : grandes + moyennes, sans petites. MSCI World, MSCI
 *  Europe, MSCI EM et leurs déclinaisons régionales suivent tous ce périmètre. */
const LARGE_MID_CAPS = { Grandes: 86, Moyennes: 14 };

/** Indices IMI (*Investable Market Index*) : le marché entier, petites incluses.
 *  C'est le seul périmètre indiciel qui mérite le nom de « tout le marché ». */
const IMI_CAPS = { Grandes: 71, Moyennes: 15, Petites: 14 };

/** Indices de très grandes valeurs : S&P 500, EURO STOXX 50, CAC 40, Nasdaq 100.
 *  Les quelques valeurs qui glisseraient en « moyennes » chez MSCI ne pèsent
 *  pas assez pour justifier une ligne. */
const MEGA_CAPS = { Grandes: 100 };

/** Stoxx Europe 600 et TOPIX : plus larges qu'un indice standard, ils
 *  descendent jusqu'aux petites valeurs sans aller aussi bas qu'un IMI. */
const BROAD_CAPS = { Grandes: 72, Moyennes: 23, Petites: 5 };

/** Indices de petites capitalisations. Par définition, rien d'autre. */
const SMALL_CAPS = { Petites: 100 };

// Répartition des émetteurs de dette, en pourcentage de l'encours. Indicative
// et arrondie, comme les autres décompositions de ce fichier.
const EURO_GOVT_GEO = {
  France: 25,
  Italie: 23,
  Allemagne: 20,
  Espagne: 15,
  Belgique: 5,
  "Pays-Bas": 5,
  Autres: 7,
};

const EURO_CORP_GEO = {
  France: 21,
  "États-Unis": 19,
  Allemagne: 13,
  "Pays-Bas": 11,
  "Royaume-Uni": 8,
  Espagne: 7,
  Autres: 21,
};

/** Une action expose un secteur et un pays uniques.
 *
 *  Toutes celles du catalogue sont de très grandes capitalisations — c'est le
 *  critère qui les y a fait entrer. Une action de petite capitalisation y
 *  entrerait avec sa propre décomposition, pas avec ce helper. */
const stock = (sector: string, country: string) => ({
  sectorBreakdown: { [sector]: 100 },
  geoBreakdown: { [country]: 100 },
  capBreakdown: MEGA_CAPS,
});

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

const CATALOG_ASSETS: SeedAsset[] = [
  // --- ETF monde, éligibles PEA -------------------------------------------
  {
    tickerYahoo: "CW8.PA",
    isin: "LU1681043599",
    name: "Amundi MSCI World Swap UCITS ETF EUR Acc",
    shortLabel: "MSCI World — CW8",
    aliases: ["world", "msci world", "cw8", "monde", "amundi world"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI World",
    peaEligible: true,
    ter: "0.0038",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2009-06-16",
    proxyTicker: "WLD.PA",
  },
  {
    tickerYahoo: "WPEA.PA",
    isin: "IE0002XZSHO1",
    name: "iShares MSCI World Swap PEA UCITS ETF EUR Acc",
    shortLabel: "MSCI World — WPEA",
    aliases: ["world", "msci world", "wpea", "ishares world pea", "monde"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI World",
    peaEligible: true,
    // Abaissé de 0,25 % à 0,20 % par BlackRock fin 2025.
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2024-04-02",
    proxyTicker: "WLD.PA",
  },
  {
    tickerYahoo: "DCAM.PA",
    isin: "FR001400U5Q4",
    name: "Amundi PEA Monde (MSCI World) UCITS ETF Acc",
    shortLabel: "MSCI World — DCAM",
    aliases: ["world", "msci world", "dcam", "amundi pea monde", "monde"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI World",
    peaEligible: true,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2025-03-04",
    proxyTicker: "WLD.PA",
  },

  // --- ETF S&P 500 ---------------------------------------------------------
  {
    tickerYahoo: "PE500.PA",
    isin: "FR0011871128",
    name: "Amundi PEA S&P 500 Screened UCITS ETF Acc",
    shortLabel: "S&P 500 — PE500",
    aliases: ["sp500", "s&p 500", "pe500", "500", "amundi sp500"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "S&P 500",
    peaEligible: true,
    ter: "0.0012",
    currency: "EUR",
    sectorBreakdown: SP500_SECTORS,
    geoBreakdown: SP500_GEO,
    capBreakdown: MEGA_CAPS,
    inceptionDate: "2019-04-25",
    proxyTicker: "SPY",
  },
  {
    tickerYahoo: "ESE.PA",
    isin: "FR0011550185",
    name: "BNP Paribas Easy S&P 500 UCITS ETF EUR C",
    shortLabel: "S&P 500 — ESE",
    aliases: ["sp500", "s&p 500", "ese", "bnp sp500"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "S&P 500",
    peaEligible: true,
    ter: "0.0014",
    currency: "EUR",
    sectorBreakdown: SP500_SECTORS,
    geoBreakdown: SP500_GEO,
    capBreakdown: MEGA_CAPS,
    inceptionDate: "2013-09-16",
    proxyTicker: "SPY",
  },
  {
    tickerYahoo: "SXR8.DE",
    isin: "IE00B5BMR087",
    name: "iShares Core S&P 500 UCITS ETF USD (Acc)",
    shortLabel: "S&P 500 — SXR8 / CSPX",
    aliases: ["sp500", "s&p 500", "sxr8", "cspx", "ishares core sp500"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "S&P 500",
    peaEligible: false,
    ter: "0.0007",
    currency: "EUR",
    sectorBreakdown: SP500_SECTORS,
    geoBreakdown: SP500_GEO,
    capBreakdown: MEGA_CAPS,
    inceptionDate: "2010-05-19",
    // Les cotations Yahoo des six premiers mois ne sont pas exploitables : le
    // cours reste figé à 96,95 pendant huit séances d'octobre 2010 puis chute
    // de 24,6 % le 1er novembre, sans opération sur titre correspondante et
    // alors que le S&P 500 était quasi stable ce jour-là. Le rapport, 1,327,
    // ne correspond à aucun ratio de division ni à une conversion de devise —
    // ce sont des relevés erronés sur une ligne Xetra encore peu échangée.
    //
    // La preuve est dans la comparaison : sur la série complète, SXR8 corrèle
    // à 0,85 avec SPY, contre 0,999 avec ESE et 0,995 avec PE500, deux ETF du
    // même indice dont l'historique commence après l'anomalie. Le défaut est
    // donc bien dans ces points-là, pas dans le reste de la série.
    //
    // SPY couvre la période, comme pour n'importe quel actif jeune.
    priceHistoryFrom: "2010-11-01",
    proxyTicker: "SPY",
  },

  // --- ETF émergents et tech, éligibles PEA --------------------------------
  {
    tickerYahoo: "PAEEM.PA",
    isin: null, // ISIN non confirmé au moment du seed : laissé vide plutôt qu'inventé.
    name: "Amundi PEA Émergent (MSCI Emerging Markets) ESG Transition UCITS ETF Acc",
    shortLabel: "Marchés émergents — PAEEM",
    aliases: ["emergents", "émergents", "emerging", "paeem", "msci emerging"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Emerging Markets",
    peaEligible: true,
    ter: "0.0020", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EM_SECTORS,
    geoBreakdown: EM_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2019-04-25",
    proxyTicker: "EEM",
  },
  {
    tickerYahoo: "PANX.PA",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "Amundi PEA US Tech Screened UCITS ETF Acc",
    shortLabel: "Tech US — PANX",
    aliases: ["nasdaq", "tech", "panx", "us tech", "technologie"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "Nasdaq / tech américaine",
    peaEligible: true,
    ter: "0.0030", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: US_TECH_SECTORS,
    geoBreakdown: US_TECH_GEO,
    capBreakdown: MEGA_CAPS,
    inceptionDate: "2019-04-25",
    proxyTicker: "QQQ",
  },

  // --- ETF hors PEA --------------------------------------------------------
  {
    tickerYahoo: "IWDA.AS",
    isin: "IE00B4L5Y983",
    name: "iShares Core MSCI World UCITS ETF USD (Acc)",
    shortLabel: "MSCI World — IWDA",
    aliases: ["world", "msci world", "iwda", "eunl", "ishares core world"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI World",
    peaEligible: false,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2009-09-25",
    proxyTicker: "WLD.PA",
  },
  {
    tickerYahoo: "VWCE.DE",
    isin: "IE00BK5BQT80",
    name: "Vanguard FTSE All-World UCITS ETF USD Accumulation",
    shortLabel: "FTSE All-World — VWCE",
    aliases: ["all world", "vwce", "vanguard", "ftse all world", "monde"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "FTSE All-World",
    peaEligible: false,
    ter: "0.0022",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: ALL_WORLD_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2019-07-29",
    proxyTicker: "VT",
  },

  // --- ETF Europe -----------------------------------------------------------
  //
  // Les actions européennes sont nativement éligibles au PEA : contrairement
  // aux ETF monde ou émergents, aucune réplication synthétique n'est nécessaire
  // pour les y loger. C'est pourquoi les ETF Europe éligibles sont à la fois
  // nombreux et peu chers.
  {
    tickerYahoo: "MEUD.PA",
    isin: "LU0908500753",
    name: "Amundi Core Stoxx Europe 600 UCITS ETF Acc",
    shortLabel: "Stoxx Europe 600 — MEUD",
    aliases: ["europe", "stoxx", "stoxx 600", "meud", "europe 600"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "Stoxx Europe 600",
    peaEligible: true,
    ter: "0.0007",
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    capBreakdown: BROAD_CAPS,
    inceptionDate: "2024-02-19",
    proxyTicker: "VEURX",
  },
  {
    tickerYahoo: "PCEU.PA",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "Amundi PEA MSCI Europe UCITS ETF Acc",
    shortLabel: "MSCI Europe — PCEU",
    aliases: ["europe", "msci europe", "pceu", "pea europe"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Europe",
    peaEligible: true,
    ter: "0.0015",
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2019-04-25",
    proxyTicker: "VEURX",
  },
  {
    tickerYahoo: "C50.PA",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "Amundi Core EURO STOXX 50 UCITS ETF EUR Acc",
    shortLabel: "EURO STOXX 50 — C50",
    aliases: ["zone euro", "euro stoxx", "eurostoxx", "c50", "eurozone"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "EURO STOXX 50",
    peaEligible: true,
    ter: "0.0005", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EUROZONE_SECTORS,
    geoBreakdown: EUROZONE_GEO,
    capBreakdown: MEGA_CAPS,
    inceptionDate: "2008-09-16",
  },
  {
    tickerYahoo: "CAC.PA",
    isin: "FR0007052782", // ISIN non reconfirmé au moment du seed.
    name: "Amundi CAC 40 UCITS ETF Dist",
    shortLabel: "CAC 40 — CAC",
    aliases: ["cac", "cac 40", "france", "paris"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "CAC 40",
    peaEligible: true,
    ter: "0.0025", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: CAC40_SECTORS,
    geoBreakdown: { France: 100 },
    capBreakdown: MEGA_CAPS,
    inceptionDate: "2008-01-02",
  },
  {
    tickerYahoo: "EXSA.DE",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares STOXX Europe 600 UCITS ETF (DE)",
    shortLabel: "Stoxx Europe 600 — EXSA",
    aliases: ["europe", "stoxx 600", "exsa", "ishares europe"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "Stoxx Europe 600",
    peaEligible: false,
    ter: "0.0020", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    capBreakdown: BROAD_CAPS,
    inceptionDate: "2008-01-02",
    proxyTicker: "VEURX",
  },
  {
    tickerYahoo: "IMEU.AS",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares Core MSCI Europe UCITS ETF EUR (Dist)",
    shortLabel: "MSCI Europe — IMEU",
    aliases: ["europe", "msci europe", "imeu"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Europe",
    peaEligible: false,
    ter: "0.0012", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2008-01-02",
    proxyTicker: "VEURX",
  },

  // --- ETF marchés émergents et Asie ---------------------------------------
  {
    tickerYahoo: "AEEM.PA",
    isin: "LU1681045370",
    name: "Amundi MSCI Emerging Markets Swap UCITS ETF EUR Acc",
    shortLabel: "Marchés émergents — AEEM",
    aliases: ["emergents", "émergents", "emerging", "aeem"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Emerging Markets",
    peaEligible: false,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: EM_SECTORS,
    geoBreakdown: EM_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2010-11-30",
    proxyTicker: "EEM",
  },
  {
    tickerYahoo: "EMIM.AS",
    isin: "IE00BKM4GZ66",
    name: "iShares Core MSCI EM IMI UCITS ETF USD (Acc)",
    shortLabel: "Émergents (IMI) — EMIM",
    aliases: ["emergents", "émergents", "emerging", "emim", "eimi", "imi"],
    type: "etf",
    assetClass: "equity",
    // L'indice IMI ajoute les petites capitalisations à l'univers émergent :
    // proche du MSCI Emerging Markets, mais ce n'est pas le même indice.
    trackedIndex: "MSCI Emerging Markets IMI",
    peaEligible: false,
    ter: "0.0018",
    currency: "EUR",
    sectorBreakdown: EM_SECTORS,
    geoBreakdown: EM_GEO,
    capBreakdown: IMI_CAPS,
    inceptionDate: "2014-06-02",
    proxyTicker: "EEM",
  },
  {
    tickerYahoo: "PAASI.PA",
    isin: "FR0013412012",
    name: "Amundi PEA Asie Émergente (MSCI Emerging Asia) Screened UCITS ETF Acc",
    shortLabel: "Asie émergente — PAASI",
    aliases: ["asie", "asie emergente", "chine", "inde", "paasi"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Emerging Asia",
    peaEligible: true,
    ter: "0.0030",
    currency: "EUR",
    sectorBreakdown: EM_ASIA_SECTORS,
    geoBreakdown: EM_ASIA_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2019-04-25",
    // L'indice émergent large sert d'approximation : l'Asie en constitue la
    // plus grande part, mais le raccord reste une reconstitution imparfaite.
    // Asie émergente prolongée par les émergents dans leur ensemble : 0,943 de
    // corrélation, 1,65 point de dérive. L'écart tient à l'Amérique latine et
    // à l'EMEA, absents du support et présents dans le proxy. Aucun fonds
    // Asie émergente n'a d'historique plus long, et `VEIEX` — essayé — fait
    // pire (0,882) en excluant la Corée du Sud.
    proxyTicker: "EEM",
  },

  // --- ETF Japon ------------------------------------------------------------
  {
    // Le prédécesseur Lyxor (PJPN, FR0011871102) a cessé de coter le 27 janvier
    // 2022 lors de l'absorption de Lyxor par Amundi : ses métadonnées Yahoo
    // restent servies, mais sa série s'arrête là. C'est bien PTPXE qu'il faut
    // utiliser aujourd'hui.
    tickerYahoo: "PTPXE.PA",
    isin: "FR0013411980",
    name: "Amundi PEA Japon (TOPIX) UCITS ETF EUR Acc",
    shortLabel: "Japon (TOPIX) — PTPXE",
    aliases: ["japon", "japan", "topix", "ptpxe", "pea japon"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "TOPIX",
    peaEligible: true,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: JAPAN_SECTORS,
    geoBreakdown: JAPAN_GEO,
    capBreakdown: BROAD_CAPS,
    inceptionDate: "2019-04-25",
    proxyTicker: "EWJ",
  },
  {
    tickerYahoo: "IJPA.AS",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares Core MSCI Japan IMI UCITS ETF USD (Acc)",
    shortLabel: "Japon (IMI) — IJPA",
    aliases: ["japon", "japan", "ijpa"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI Japan IMI",
    peaEligible: false,
    ter: "0.0015", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: JAPAN_SECTORS,
    geoBreakdown: JAPAN_GEO,
    capBreakdown: IMI_CAPS,
    inceptionDate: "2009-09-25",
    // Division d'actions non répercutée sur les cours ajustés de Yahoo : le
    // 13 octobre 2009, la série passe de 24,405 à 16,450 et n'y revient
    // jamais. Le rapport, 1,483, est celui d'une division de trois pour deux ;
    // le Japon, lui, n'a pas perdu un tiers de sa valeur ce jour-là. Les trois
    // semaines antérieures sont donc libellées sur une autre base et
    // fausseraient tout raccord. EWJ couvre la période.
    priceHistoryFrom: "2009-10-13",
    proxyTicker: "EWJ",
  },

  // --- Compléments d'un portefeuille mondial --------------------------------
  {
    tickerYahoo: "EXUS.DE",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "Xtrackers MSCI World ex USA UCITS ETF 1C",
    shortLabel: "Monde hors USA — EXUS",
    aliases: ["monde hors usa", "world ex us", "ex usa", "exus"],
    type: "etf",
    assetClass: "equity",
    // Le complément exact d'un ETF S&P 500 : permet de doser soi-même le poids
    // américain plutôt que de subir les 72 % d'un MSCI World.
    trackedIndex: "MSCI World ex USA",
    peaEligible: false,
    ter: "0.0015", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: WORLD_EX_US_SECTORS,
    geoBreakdown: WORLD_EX_US_GEO,
    capBreakdown: LARGE_MID_CAPS,
    inceptionDate: "2024-03-11",
    // Monde développé hors États-Unis prolongé par un fonds qui inclut, lui, les
    // émergents et les petites capitalisations : 0,943 de corrélation pour
    // 5,91 points de dérive, mesurés sur seulement deux ans et demi de
    // recouvrement, ce qui rend l'estimation de dérive très bruitée. Le proxy
    // précédent, `VEU`, faisait légèrement moins bien sur les deux critères
    // (0,941 et 6,23) pour huit ans d'historique en moins.
    proxyTicker: "VGTSX",
  },
  {
    tickerYahoo: "IUSN.DE",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares MSCI World Small Cap UCITS ETF",
    shortLabel: "Petites capitalisations — IUSN",
    aliases: ["small cap", "petites capitalisations", "iusn"],
    type: "etf",
    assetClass: "equity",
    trackedIndex: "MSCI World Small Cap",
    peaEligible: false,
    ter: "0.0035", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: SMALL_CAP_SECTORS,
    geoBreakdown: SMALL_CAP_GEO,
    capBreakdown: SMALL_CAPS,
    inceptionDate: "2018-04-26",
    // Le Russell 2000 ne couvre que les petites valeurs américaines, qui pèsent
    // environ 60 % de l'indice monde : approximation assumée.
    proxyTicker: "IWM",
  },

  // --- Métaux précieux (ETC) ----------------------------------------------
  {
    tickerYahoo: "GOLD.PA",
    isin: "FR0013416716",
    name: "Amundi Physical Gold ETC (C)",
    shortLabel: "Or physique — GOLD",
    aliases: ["or", "gold", "or physique", "métaux"],
    type: "metal",
    assetClass: "commodity",
    peaEligible: false,
    ter: "0.0012",
    // Coté à Paris mais libellé en dollars : la conversion FX s'applique.
    currency: "USD",
    sectorBreakdown: { "Or physique": 100 },
    geoBreakdown: { "Matières premières": 100 },
    inceptionDate: "2019-05-23",
    // Or physique contre contrats à terme : `verify-proxies` mesure 0,856 de
    // corrélation et 2,47 points de dérive, et c'est attendu. Un contrat à
    // terme se reporte d'échéance en échéance, avec un coût ou un gain de
    // portage que le métal détenu en coffre n'a pas. C'est le seul historique
    // long disponible pour l'or, et l'écart est dans le sens prudent.
    proxyTicker: "GC=F",
  },
  {
    tickerYahoo: "PHAG.L",
    isin: "JE00B1VS3333",
    name: "WisdomTree Physical Silver",
    shortLabel: "Argent physique — PHAG",
    aliases: ["argent", "silver", "phag", "métaux"],
    type: "metal",
    assetClass: "commodity",
    peaEligible: false,
    ter: "0.0049",
    currency: "USD",
    sectorBreakdown: { "Argent physique": 100 },
    geoBreakdown: { "Matières premières": 100 },
    inceptionDate: "2008-01-01",
    proxyTicker: "SI=F",
  },

  // --- Crypto-actifs -------------------------------------------------------
  {
    tickerYahoo: "BTC-EUR",
    isin: null,
    name: "Bitcoin",
    shortLabel: "Bitcoin — BTC",
    aliases: ["bitcoin", "btc", "crypto"],
    type: "crypto",
    assetClass: "crypto",
    peaEligible: false,
    ter: null,
    currency: "EUR",
    sectorBreakdown: { "Crypto-actifs": 100 },
    geoBreakdown: { "Crypto-actifs": 100 },
    inceptionDate: "2014-09-17",
  },
  {
    tickerYahoo: "ETH-EUR",
    isin: null,
    name: "Ethereum",
    shortLabel: "Ethereum — ETH",
    aliases: ["ethereum", "eth", "crypto"],
    type: "crypto",
    assetClass: "crypto",
    peaEligible: false,
    ter: null,
    currency: "EUR",
    sectorBreakdown: { "Crypto-actifs": 100 },
    geoBreakdown: { "Crypto-actifs": 100 },
    inceptionDate: "2017-11-11",
  },

  // --- Actions européennes (éligibles PEA) ---------------------------------
  {
    tickerYahoo: "MC.PA",
    isin: "FR0000121014",
    name: "LVMH Moët Hennessy Louis Vuitton SE",
    shortLabel: "LVMH — MC",
    aliases: ["lvmh", "luxe", "moet"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Consommation discrétionnaire", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "TTE.PA",
    isin: "FR0000120271",
    name: "TotalEnergies SE",
    shortLabel: "TotalEnergies — TTE",
    aliases: ["total", "totalenergies", "pétrole"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Énergie", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "AI.PA",
    isin: "FR0000120073",
    name: "L'Air Liquide S.A.",
    shortLabel: "Air Liquide — AI",
    aliases: ["air liquide", "gaz industriels"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Matériaux", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "SAN.PA",
    isin: "FR0000120578",
    name: "Sanofi S.A.",
    shortLabel: "Sanofi — SAN",
    aliases: ["sanofi", "pharma", "santé"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Santé", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "OR.PA",
    isin: "FR0000120321",
    name: "L'Oréal S.A.",
    shortLabel: "L'Oréal — OR",
    aliases: ["loreal", "l'oréal", "cosmétiques"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Consommation de base", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "SU.PA",
    isin: "FR0000121972",
    name: "Schneider Electric S.E.",
    shortLabel: "Schneider Electric — SU",
    aliases: ["schneider", "electric"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Industrie", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "AIR.PA",
    isin: "NL0000235190",
    name: "Airbus SE",
    shortLabel: "Airbus — AIR",
    aliases: ["airbus", "aéronautique"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Industrie", "France"),
    inceptionDate: "2001-09-03",
  },
  {
    tickerYahoo: "RMS.PA",
    isin: "FR0000052292",
    name: "Hermès International S.A.",
    shortLabel: "Hermès — RMS",
    aliases: ["hermes", "hermès", "luxe"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Consommation discrétionnaire", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "DG.PA",
    isin: "FR0000125486",
    name: "Vinci S.A.",
    shortLabel: "Vinci — DG",
    aliases: ["vinci", "construction", "concessions"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Industrie", "France"),
    inceptionDate: "2000-01-03",
  },
  {
    tickerYahoo: "BNP.PA",
    isin: "FR0000131104",
    name: "BNP Paribas S.A.",
    shortLabel: "BNP Paribas — BNP",
    aliases: ["bnp", "banque", "paribas"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Finance", "France"),
    inceptionDate: "1993-10-18",
  },
  {
    tickerYahoo: "ASML.AS",
    isin: "NL0010273215",
    name: "ASML Holding N.V.",
    shortLabel: "ASML — ASML",
    aliases: ["asml", "semi-conducteurs", "lithographie"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Technologie", "Pays-Bas"),
    inceptionDate: "1998-07-20",
  },
  {
    tickerYahoo: "SAP.DE",
    isin: "DE0007164600",
    name: "SAP SE",
    shortLabel: "SAP — SAP",
    aliases: ["sap", "logiciel", "allemagne"],
    type: "stock",
    assetClass: "equity",
    peaEligible: true,
    ter: null,
    currency: "EUR",
    ...stock("Technologie", "Allemagne"),
    inceptionDate: "1998-04-09",
  },

  // --- Actions américaines (hors PEA) --------------------------------------
  {
    tickerYahoo: "AAPL",
    isin: "US0378331005",
    name: "Apple Inc.",
    shortLabel: "Apple — AAPL",
    aliases: ["apple", "aapl"],
    type: "stock",
    assetClass: "equity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Technologie", "États-Unis"),
    inceptionDate: "1980-12-12",
  },
  {
    tickerYahoo: "MSFT",
    isin: "US5949181045",
    name: "Microsoft Corporation",
    shortLabel: "Microsoft — MSFT",
    aliases: ["microsoft", "msft"],
    type: "stock",
    assetClass: "equity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Technologie", "États-Unis"),
    inceptionDate: "1986-03-13",
  },
  {
    tickerYahoo: "NVDA",
    isin: "US67066G1040",
    name: "NVIDIA Corporation",
    shortLabel: "NVIDIA — NVDA",
    aliases: ["nvidia", "nvda", "semi-conducteurs"],
    type: "stock",
    assetClass: "equity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Technologie", "États-Unis"),
    inceptionDate: "1999-01-22",
  },
  {
    tickerYahoo: "AMZN",
    isin: "US0231351067",
    name: "Amazon.com, Inc.",
    shortLabel: "Amazon — AMZN",
    aliases: ["amazon", "amzn"],
    type: "stock",
    assetClass: "equity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Consommation discrétionnaire", "États-Unis"),
    inceptionDate: "1997-05-15",
  },
  {
    tickerYahoo: "GOOGL",
    isin: "US02079K3059",
    name: "Alphabet Inc. (Class A)",
    shortLabel: "Alphabet — GOOGL",
    aliases: ["google", "alphabet", "googl"],
    type: "stock",
    assetClass: "equity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Communication", "États-Unis"),
    inceptionDate: "2004-08-19",
  },
  {
    tickerYahoo: "BRK-B",
    isin: "US0846707026",
    name: "Berkshire Hathaway Inc. (Class B)",
    shortLabel: "Berkshire Hathaway — BRK.B",
    aliases: ["berkshire", "buffett", "brk"],
    type: "stock",
    assetClass: "equity",
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Finance", "États-Unis"),
    inceptionDate: "1996-05-09",
  },

  // --- Supports de taux ----------------------------------------------------
  //
  // Sans eux, un profil prudent n'a aucun levier : baisser la part actions
  // n'aurait nulle part où mettre le reste. Ce sont ces lignes qui rendent
  // possible une gamme allant du défensif au dynamique.
  //
  // Aucun n'est éligible au PEA — les ETF obligataires en sont exclus par
  // construction, faute d'actions européennes en sous-jacent.
  //
  // Vérifications faites en août 2026 : chaque symbole a été interrogé chez
  // Yahoo, et sa **volatilité réalisée a été calculée** pour confirmer sa
  // nature. Le contrôle n'est pas superflu — Yahoo intervertit régulièrement
  // les libellés des lignes iShares cotées à Xetra. Une obligataire ressort
  // entre 1 et 6 % de volatilité annualisée là où le MSCI World est à 14,4 % :
  // la signature ne trompe pas, contrairement au nom.
  //
  // Les TER viennent de `fundProfile.feesExpensesInvestment` chez Yahoo, source
  // recoupée sur deux lignes connues du catalogue : CW8 y ressort à 0,38 % et
  // WPEA à 0,20 %, exactement les valeurs curatées ici.
  //
  // Pas de décomposition sectorielle : elle n'a pas de sens pour de la dette.
  // La répartition géographique est celle des émetteurs.
  {
    tickerYahoo: "EUNH.DE",
    isin: "IE00B4WXJJ64",
    name: "iShares Core € Govt Bond UCITS ETF",
    shortLabel: "Obligations d'État € — EUNH",
    aliases: [
      "obligations",
      "obligation",
      "etat",
      "souverain",
      "govt bond",
      "eunh",
      "taux",
    ],
    type: "etf",
    assetClass: "bond",
    trackedIndex: "Obligations d'État zone euro",
    peaEligible: false,
    ter: "0.0009",
    currency: "EUR",
    sectorBreakdown: null,
    geoBreakdown: EURO_GOVT_GEO,
    // Volatilité mesurée 5,0 %, baisse maximale −22,4 % (choc de taux 2022).
    inceptionDate: "2009-04-17",
  },
  {
    tickerYahoo: "IBGS.AS",
    isin: "IE00B14X4Q57",
    name: "iShares € Govt Bond 1-3yr UCITS ETF",
    shortLabel: "Obligations d'État € 1-3 ans — IBGS",
    aliases: [
      "obligations courtes",
      "court terme",
      "1-3 ans",
      "ibgs",
      "peu risque",
    ],
    type: "etf",
    assetClass: "bond",
    trackedIndex: "Obligations d'État zone euro 1-3 ans",
    peaEligible: false,
    ter: "0.002",
    currency: "EUR",
    sectorBreakdown: null,
    geoBreakdown: EURO_GOVT_GEO,
    // Volatilité mesurée 1,8 %, baisse maximale −6,2 % : la ligne la plus
    // stable du catalogue, et l'historique le plus long de cette section.
    inceptionDate: "2008-01-02",
  },
  {
    tickerYahoo: "EUN5.DE",
    isin: "IE00B3F81R35",
    name: "iShares Core € Corp Bond UCITS ETF",
    shortLabel: "Obligations d'entreprise € — EUN5",
    aliases: ["obligations entreprise", "corporate", "credit", "eun5"],
    type: "etf",
    assetClass: "bond",
    trackedIndex: "Obligations d'entreprise zone euro",
    peaEligible: false,
    ter: "0.002",
    currency: "EUR",
    sectorBreakdown: null,
    geoBreakdown: EURO_CORP_GEO,
    // Volatilité mesurée 4,1 %, baisse maximale −17,3 %.
    inceptionDate: "2009-05-26",
  },
  {
    tickerYahoo: "IBCI.DE",
    isin: "IE00B0M62X26",
    name: "iShares € Inflation Linked Govt Bond UCITS ETF",
    shortLabel: "Obligations indexées inflation — IBCI",
    aliases: ["inflation", "indexee", "tips", "oati", "ibci"],
    type: "etf",
    assetClass: "bond",
    trackedIndex: "Obligations d'État zone euro indexées inflation",
    peaEligible: false,
    ter: "0.0009",
    currency: "EUR",
    sectorBreakdown: null,
    geoBreakdown: { France: 47, Italie: 27, Allemagne: 15, Espagne: 11 },
    // Volatilité mesurée 5,9 %, baisse maximale −16,4 %.
    inceptionDate: "2009-01-14",
  },
  {
    tickerYahoo: "ERNE.AS",
    isin: "IE00BCRY6003",
    name: "iShares € Ultrashort Bond UCITS ETF",
    shortLabel: "Très court terme € — ERNE",
    aliases: ["monetaire", "ultra court", "liquidites", "cash", "erne"],
    type: "etf",
    assetClass: "money_market",
    trackedIndex: "Obligations € très court terme",
    peaEligible: false,
    ter: "0.0009",
    currency: "EUR",
    sectorBreakdown: null,
    geoBreakdown: EURO_CORP_GEO,
    // Volatilité mesurée 0,9 %, baisse maximale −4,1 % : le substitut de
    // liquidités du catalogue. Ce n'est pas un fonds monétaire au sens
    // réglementaire, mais son comportement en tient lieu.
    inceptionDate: "2013-11-13",
  },
];

export const SEED_ASSETS: SeedAsset[] = [...PROXY_ASSETS, ...CATALOG_ASSETS];

/** Tickers proposés comme benchmark dans l'éditeur de stratégie. */
export const BENCHMARK_TICKERS = ["CW8.PA", "ESE.PA"] as const;
