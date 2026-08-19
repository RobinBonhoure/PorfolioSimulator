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
    trackedIndex: "MSCI Emerging Markets",
    peaEligible: false,
    ter: "0.0070",
    currency: "USD",
    inceptionDate: "2003-04-14",
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
    trackedIndex: "Russell 2000",
    peaEligible: false,
    ter: "0.0019",
    currency: "USD",
    inceptionDate: "2000-05-26",
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

/** Une action expose un secteur et un pays uniques. */
const stock = (sector: string, country: string) => ({
  sectorBreakdown: { [sector]: 100 },
  geoBreakdown: { [country]: 100 },
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
    trackedIndex: "MSCI World",
    peaEligible: true,
    ter: "0.0038",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    inceptionDate: "2009-06-16",
  },
  {
    tickerYahoo: "WPEA.PA",
    isin: "IE0002XZSHO1",
    name: "iShares MSCI World Swap PEA UCITS ETF EUR Acc",
    shortLabel: "MSCI World — WPEA",
    aliases: ["world", "msci world", "wpea", "ishares world pea", "monde"],
    type: "etf",
    trackedIndex: "MSCI World",
    peaEligible: true,
    // Abaissé de 0,25 % à 0,20 % par BlackRock fin 2025.
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    inceptionDate: "2024-04-02",
    proxyTicker: "CW8.PA",
  },
  {
    tickerYahoo: "DCAM.PA",
    isin: "FR001400U5Q4",
    name: "Amundi PEA Monde (MSCI World) UCITS ETF Acc",
    shortLabel: "MSCI World — DCAM",
    aliases: ["world", "msci world", "dcam", "amundi pea monde", "monde"],
    type: "etf",
    trackedIndex: "MSCI World",
    peaEligible: true,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    inceptionDate: "2025-03-04",
    proxyTicker: "CW8.PA",
  },

  // --- ETF S&P 500 ---------------------------------------------------------
  {
    tickerYahoo: "PE500.PA",
    isin: "FR0011871128",
    name: "Amundi PEA S&P 500 Screened UCITS ETF Acc",
    shortLabel: "S&P 500 — PE500",
    aliases: ["sp500", "s&p 500", "pe500", "500", "amundi sp500"],
    type: "etf",
    trackedIndex: "S&P 500",
    peaEligible: true,
    ter: "0.0012",
    currency: "EUR",
    sectorBreakdown: SP500_SECTORS,
    geoBreakdown: SP500_GEO,
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
    trackedIndex: "S&P 500",
    peaEligible: true,
    ter: "0.0014",
    currency: "EUR",
    sectorBreakdown: SP500_SECTORS,
    geoBreakdown: SP500_GEO,
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
    trackedIndex: "S&P 500",
    peaEligible: false,
    ter: "0.0007",
    currency: "EUR",
    sectorBreakdown: SP500_SECTORS,
    geoBreakdown: SP500_GEO,
    inceptionDate: "2010-05-19",
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
    trackedIndex: "MSCI Emerging Markets",
    peaEligible: true,
    ter: "0.0020", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EM_SECTORS,
    geoBreakdown: EM_GEO,
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
    trackedIndex: "Nasdaq / tech américaine",
    peaEligible: true,
    ter: "0.0030", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: US_TECH_SECTORS,
    geoBreakdown: US_TECH_GEO,
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
    trackedIndex: "MSCI World",
    peaEligible: false,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: MSCI_WORLD_GEO,
    inceptionDate: "2009-09-25",
  },
  {
    tickerYahoo: "VWCE.DE",
    isin: "IE00BK5BQT80",
    name: "Vanguard FTSE All-World UCITS ETF USD Accumulation",
    shortLabel: "FTSE All-World — VWCE",
    aliases: ["all world", "vwce", "vanguard", "ftse all world", "monde"],
    type: "etf",
    trackedIndex: "FTSE All-World",
    peaEligible: false,
    ter: "0.0022",
    currency: "EUR",
    sectorBreakdown: MSCI_WORLD_SECTORS,
    geoBreakdown: ALL_WORLD_GEO,
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
    trackedIndex: "Stoxx Europe 600",
    peaEligible: true,
    ter: "0.0007",
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    inceptionDate: "2024-02-19",
    proxyTicker: "EXSA.DE",
  },
  {
    tickerYahoo: "PCEU.PA",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "Amundi PEA MSCI Europe UCITS ETF Acc",
    shortLabel: "MSCI Europe — PCEU",
    aliases: ["europe", "msci europe", "pceu", "pea europe"],
    type: "etf",
    trackedIndex: "MSCI Europe",
    peaEligible: true,
    ter: "0.0015",
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    inceptionDate: "2019-04-25",
    proxyTicker: "IMEU.AS",
  },
  {
    tickerYahoo: "C50.PA",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "Amundi Core EURO STOXX 50 UCITS ETF EUR Acc",
    shortLabel: "EURO STOXX 50 — C50",
    aliases: ["zone euro", "euro stoxx", "eurostoxx", "c50", "eurozone"],
    type: "etf",
    trackedIndex: "EURO STOXX 50",
    peaEligible: true,
    ter: "0.0005", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EUROZONE_SECTORS,
    geoBreakdown: EUROZONE_GEO,
    inceptionDate: "2008-09-16",
  },
  {
    tickerYahoo: "CAC.PA",
    isin: "FR0007052782", // ISIN non reconfirmé au moment du seed.
    name: "Amundi CAC 40 UCITS ETF Dist",
    shortLabel: "CAC 40 — CAC",
    aliases: ["cac", "cac 40", "france", "paris"],
    type: "etf",
    trackedIndex: "CAC 40",
    peaEligible: true,
    ter: "0.0025", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: CAC40_SECTORS,
    geoBreakdown: { France: 100 },
    inceptionDate: "2008-01-02",
  },
  {
    tickerYahoo: "EXSA.DE",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares STOXX Europe 600 UCITS ETF (DE)",
    shortLabel: "Stoxx Europe 600 — EXSA",
    aliases: ["europe", "stoxx 600", "exsa", "ishares europe"],
    type: "etf",
    trackedIndex: "Stoxx Europe 600",
    peaEligible: false,
    ter: "0.0020", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    inceptionDate: "2008-01-02",
  },
  {
    tickerYahoo: "IMEU.AS",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares Core MSCI Europe UCITS ETF EUR (Dist)",
    shortLabel: "MSCI Europe — IMEU",
    aliases: ["europe", "msci europe", "imeu"],
    type: "etf",
    trackedIndex: "MSCI Europe",
    peaEligible: false,
    ter: "0.0012", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: EUROPE_SECTORS,
    geoBreakdown: EUROPE_GEO,
    inceptionDate: "2008-01-02",
  },

  // --- ETF marchés émergents et Asie ---------------------------------------
  {
    tickerYahoo: "AEEM.PA",
    isin: "LU1681045370",
    name: "Amundi MSCI Emerging Markets Swap UCITS ETF EUR Acc",
    shortLabel: "Marchés émergents — AEEM",
    aliases: ["emergents", "émergents", "emerging", "aeem"],
    type: "etf",
    trackedIndex: "MSCI Emerging Markets",
    peaEligible: false,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: EM_SECTORS,
    geoBreakdown: EM_GEO,
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
    // L'indice IMI ajoute les petites capitalisations à l'univers émergent :
    // proche du MSCI Emerging Markets, mais ce n'est pas le même indice.
    trackedIndex: "MSCI Emerging Markets IMI",
    peaEligible: false,
    ter: "0.0018",
    currency: "EUR",
    sectorBreakdown: EM_SECTORS,
    geoBreakdown: EM_GEO,
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
    trackedIndex: "MSCI Emerging Asia",
    peaEligible: true,
    ter: "0.0030",
    currency: "EUR",
    sectorBreakdown: EM_ASIA_SECTORS,
    geoBreakdown: EM_ASIA_GEO,
    inceptionDate: "2019-04-25",
    // L'indice émergent large sert d'approximation : l'Asie en constitue la
    // plus grande part, mais le raccord reste une reconstitution imparfaite.
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
    trackedIndex: "TOPIX",
    peaEligible: true,
    ter: "0.0020",
    currency: "EUR",
    sectorBreakdown: JAPAN_SECTORS,
    geoBreakdown: JAPAN_GEO,
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
    trackedIndex: "MSCI Japan IMI",
    peaEligible: false,
    ter: "0.0015", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: JAPAN_SECTORS,
    geoBreakdown: JAPAN_GEO,
    inceptionDate: "2009-09-25",
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
    // Le complément exact d'un ETF S&P 500 : permet de doser soi-même le poids
    // américain plutôt que de subir les 72 % d'un MSCI World.
    trackedIndex: "MSCI World ex USA",
    peaEligible: false,
    ter: "0.0015", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: WORLD_EX_US_SECTORS,
    geoBreakdown: WORLD_EX_US_GEO,
    inceptionDate: "2024-03-11",
    proxyTicker: "VEU",
  },
  {
    tickerYahoo: "IUSN.DE",
    isin: null, // ISIN non confirmé au moment du seed.
    name: "iShares MSCI World Small Cap UCITS ETF",
    shortLabel: "Petites capitalisations — IUSN",
    aliases: ["small cap", "petites capitalisations", "iusn"],
    type: "etf",
    trackedIndex: "MSCI World Small Cap",
    peaEligible: false,
    ter: "0.0035", // TER non confirmé auprès de l'émetteur.
    currency: "EUR",
    sectorBreakdown: SMALL_CAP_SECTORS,
    geoBreakdown: SMALL_CAP_GEO,
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
    peaEligible: false,
    ter: "0.0012",
    // Coté à Paris mais libellé en dollars : la conversion FX s'applique.
    currency: "USD",
    sectorBreakdown: { "Or physique": 100 },
    geoBreakdown: { "Matières premières": 100 },
    inceptionDate: "2019-05-23",
    proxyTicker: "GC=F",
  },
  {
    tickerYahoo: "PHAG.L",
    isin: "JE00B1VS3333",
    name: "WisdomTree Physical Silver",
    shortLabel: "Argent physique — PHAG",
    aliases: ["argent", "silver", "phag", "métaux"],
    type: "metal",
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
    peaEligible: false,
    ter: null,
    currency: "USD",
    ...stock("Finance", "États-Unis"),
    inceptionDate: "1996-05-09",
  },
];

export const SEED_ASSETS: SeedAsset[] = [...PROXY_ASSETS, ...CATALOG_ASSETS];

/** Tickers proposés comme benchmark dans l'éditeur de stratégie. */
export const BENCHMARK_TICKERS = ["CW8.PA", "ESE.PA"] as const;
