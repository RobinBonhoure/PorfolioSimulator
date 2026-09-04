import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/**
 * Contrôle de fidélité des proxys.
 *
 * Un proxy prolonge l'historique d'un support vers le passé. S'il ne suit pas
 * la même exposition, le backtest devient faux **sans rien signaler** : la
 * courbe reste lisse, les métriques restent plausibles, et rien à l'écran ne
 * distingue une antériorité reconstituée correctement d'une autre qui raconte
 * l'histoire d'un marché différent. C'est le type d'erreur que ce script
 * existe pour attraper.
 *
 * Méthode : sur la période où les deux séries coexistent, une fois ramenées en
 * euros comme le fait le moteur, on mesure deux choses.
 *
 * - **La corrélation des rendements mensuels** dit si les deux instruments
 *   bougent ensemble. C'est le critère principal : le raccord de `spliceProxy`
 *   recale les niveaux, si bien que seule la forme des rendements est reprise
 *   du proxy.
 * - **L'écart de rendement annualisé** dit s'ils dérivent l'un de l'autre. Une
 *   dérive d'un point par an paraît anodine et déforme pourtant de 22 % une
 *   reconstitution sur vingt ans.
 *
 * Les seuils ci-dessous sont indicatifs et servent à attirer l'œil, pas à
 * valider automatiquement : un support régional prolongé par un fonds mondial
 * dépassera toujours le seuil sans que ce soit une erreur, tant que c'est
 * assumé. Ce qui compte est qu'aucune ligne ne dépasse *sans qu'on sache
 * pourquoi*.
 *
 * N'écrit rien en base hors hydratation du cache de cours. À relancer après
 * toute modification des `proxyTicker` du seed.
 */

/** Au-delà, la ligne est signalée pour examen. */
const CORRELATION_FLOOR = 0.95;
const DRIFT_CEILING_POINTS = 2;

/** En deçà, la période commune est trop courte pour conclure quoi que ce soit. */
const MIN_COMMON_DAYS = 250;

interface Measured {
  ticker: string;
  proxy: string;
  correlation: number;
  driftPoints: number;
  years: number;
  from: string;
}

async function main() {
  const { db } = await import("@/lib/db");
  const { assets } = await import("@/lib/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");
  const { ensureAssetPrices, loadPriceSeries, loadFxSeries } = await import(
    "@/lib/data-fetching/cache-orchestrator"
  );

  const fxCache = new Map<string, Map<string, number>>();

  /** Série d'un actif en euros, taux reporté depuis la veille comme au moteur. */
  async function eurSeries(id: string, currency: string, from?: string) {
    const prices = await loadPriceSeries(id, from);
    if (currency === "EUR") {
      return new Map(prices.map((p) => [p.date, p.close] as const));
    }

    if (!fxCache.has(currency)) {
      const fx = await loadFxSeries(currency);
      fxCache.set(currency, new Map(fx.map((f) => [f.date, f.rateToEur])));
    }

    const fx = fxCache.get(currency)!;
    const dates = [...fx.keys()].sort();
    const out = new Map<string, number>();
    let cursor = 0;
    let last: number | null = null;

    for (const point of prices) {
      while (cursor < dates.length && dates[cursor] <= point.date) {
        last = fx.get(dates[cursor])!;
        cursor += 1;
      }
      if (last !== null) out.set(point.date, point.close * last);
    }
    return out;
  }

  const rows = await db
    .select()
    .from(assets)
    .where(isNotNull(assets.proxyAssetId));

  const measured: Measured[] = [];
  const flagged: string[] = [];

  for (const asset of rows) {
    const [proxy] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, asset.proxyAssetId!));

    for (const one of [asset, proxy]) {
      const outcome = await ensureAssetPrices(one.id, one.tickerYahoo);
      if (outcome.warning) console.error(`  ! ${one.tickerYahoo} : ${outcome.warning}`);
    }

    const own = await eurSeries(
      asset.id,
      asset.currency,
      asset.priceHistoryFrom ?? undefined,
    );
    const other = await eurSeries(
      proxy.id,
      proxy.currency,
      proxy.priceHistoryFrom ?? undefined,
    );

    const common = [...own.keys()].filter((d) => other.has(d)).sort();
    if (common.length < MIN_COMMON_DAYS) {
      flagged.push(
        `${asset.tickerYahoo} / ${proxy.tickerYahoo} : seulement ${common.length} jours communs, ` +
          `fidélité invérifiable`,
      );
      continue;
    }

    // Un point par mois, pris au dernier jour commun du mois.
    const lastOfMonth = new Map<string, string>();
    for (const date of common) lastOfMonth.set(date.slice(0, 7), date);
    const marks = [...lastOfMonth.values()].sort();

    const a: number[] = [];
    const b: number[] = [];
    for (let i = 1; i < marks.length; i += 1) {
      a.push(own.get(marks[i])! / own.get(marks[i - 1])! - 1);
      b.push(other.get(marks[i])! / other.get(marks[i - 1])! - 1);
    }

    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const ma = mean(a);
    const mb = mean(b);
    let cov = 0;
    let va = 0;
    let vb = 0;
    for (let i = 0; i < a.length; i += 1) {
      cov += (a[i] - ma) * (b[i] - mb);
      va += (a[i] - ma) ** 2;
      vb += (b[i] - mb) ** 2;
    }
    const correlation = cov / Math.sqrt(va * vb);

    const first = common[0];
    const last = common.at(-1)!;
    const years = (+new Date(last) - +new Date(first)) / (365.25 * 86_400_000);
    const cagr = (m: Map<string, number>) =>
      (Math.pow(m.get(last)! / m.get(first)!, 1 / years) - 1) * 100;
    const driftPoints = Math.abs(cagr(own) - cagr(other));

    measured.push({
      ticker: asset.tickerYahoo,
      proxy: proxy.tickerYahoo,
      correlation,
      driftPoints,
      years,
      from: first,
    });

    if (correlation < CORRELATION_FLOOR || driftPoints > DRIFT_CEILING_POINTS) {
      flagged.push(
        `${asset.tickerYahoo} / ${proxy.tickerYahoo} : corrélation ${correlation.toFixed(3)}, ` +
          `dérive ${driftPoints.toFixed(2)} pt/an sur ${years.toFixed(1)} ans`,
      );
    }
  }

  measured.sort((x, y) => x.correlation - y.correlation);

  console.log("support     proxy      depuis       durée   corrélation   dérive");
  console.log("-".repeat(70));
  for (const m of measured) {
    console.log(
      `${m.ticker.padEnd(11)} ${m.proxy.padEnd(10)} ${m.from}  ` +
        `${m.years.toFixed(1).padStart(5)} ans  ` +
        `${m.correlation.toFixed(3).padStart(10)}  ` +
        `${m.driftPoints.toFixed(2).padStart(6)} pt`,
    );
  }

  console.log(`\n${measured.length} couples mesurés.`);
  if (flagged.length === 0) {
    console.log(
      `Tous au-dessus de ${CORRELATION_FLOOR} de corrélation et sous ${DRIFT_CEILING_POINTS} points de dérive.`,
    );
    return;
  }

  console.log(`\n${flagged.length} à examiner :`);
  for (const line of flagged) console.log(`  - ${line}`);
  console.log(
    "\nUn dépassement n'est pas forcément une erreur — un support régional prolongé\n" +
      "par un fonds plus large en produit un légitimement. Il doit en revanche être\n" +
      "expliqué en commentaire dans le seed, à côté du `proxyTicker` concerné.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
