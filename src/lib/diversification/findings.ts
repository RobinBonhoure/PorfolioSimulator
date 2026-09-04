import type { BreakdownSlice } from "@/lib/backtest/breakdowns";
import { formatPercent } from "@/lib/utils/format";
import type { OverlapPair } from "./overlap";
import type {
  AxisScore,
  DiversifiableHolding,
  Finding,
  FindingSeverity,
} from "./types";

/**
 * Constats et corrections.
 *
 * Les jauges disent où l'allocation est faible ; les constats disent quoi en
 * faire. Chacun porte donc obligatoirement une action — un constat sans suite
 * n'est qu'un reproche, et l'utilisateur qui lit « 72 % aux États-Unis » sans
 * savoir quoi ajouter est exactement aussi avancé qu'avant.
 *
 * Les actions restent formulées en **catégories de support**, jamais en
 * tickers : le module ne connaît pas le catalogue, et ne doit pas le connaître.
 * C'est au parcours guidé de proposer la ligne concrète, en fonction de
 * l'enveloppe — PEA ou compte-titres — que le reste de l'allocation impose.
 */

const PERCENT = (value: number) => formatPercent(value / 100, 0);

/** Une ligne « étroite » : un pari isolé sur une entreprise ou un thème.
 *
 *  Le test combine les deux dimensions, et il le faut : un ETF CAC 40 est
 *  géographiquement étroit sans être un pari sectoriel, et l'axe géographique
 *  s'en charge déjà. Ce qu'on cherche ici, c'est la ligne qu'aucun autre axe
 *  n'attrape — l'action unique, l'ETF thématique — parce qu'elle concentre à la
 *  fois le pays et le métier. */
function isNarrow(holding: DiversifiableHolding): boolean {
  const top = (breakdown: Record<string, number> | null) => {
    if (!breakdown) return 0;
    const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
    if (total <= 0) return 0;
    return (Math.max(...Object.values(breakdown)) / total) * 100;
  };

  return top(holding.geoBreakdown) >= 95 && top(holding.sectorBreakdown) >= 40;
}

/** Ordre de lecture : ce qu'il faut corriger, puis ce qu'il faut regarder,
 *  puis ce qu'il faut savoir. */
const SEVERITY_RANK: Record<FindingSeverity, number> = {
  high: 0,
  medium: 1,
  info: 2,
};

export function buildFindings(input: {
  holdings: readonly DiversifiableHolding[];
  axes: AxisScore[];
  overlap: OverlapPair | null;
  dominantGeo: BreakdownSlice | null;
  dominantSector: BreakdownSlice | null;
}): Finding[] {
  const { holdings, axes, overlap, dominantGeo, dominantSector } = input;
  const findings: Finding[] = [];
  const axis = (key: string) => axes.find((a) => a.key === key) ?? null;

  // --- Doublon d'indice : exact, et corrigeable en une opération ------------
  if (overlap?.sameIndex) {
    const [cheap, dear] =
      (overlap.a.ter ?? Infinity) <= (overlap.b.ter ?? Infinity)
        ? [overlap.a, overlap.b]
        : [overlap.b, overlap.a];

    const terNote =
      cheap.ter !== null && dear.ter !== null
        ? ` ${cheap.label} facture ${formatPercent(cheap.ter, 2)} contre ${formatPercent(dear.ter, 2)}.`
        : "";

    findings.push({
      id: "overlap-same-index",
      severity: "high",
      axis: "overlap",
      title: `${overlap.a.label} et ${overlap.b.label} répliquent le même indice`,
      detail: `Ces deux lignes achètent exactement les mêmes entreprises dans les mêmes proportions. Elles n'apportent aucune diversification l'une par rapport à l'autre — seulement deux fois les frais de tenue et deux lignes à rééquilibrer.${terNote}`,
      action: `Ne garder que ${cheap.label} et lui transférer le poids de l'autre.`,
    });
  } else if (overlap && overlap.duplicated >= 25) {
    const strong = overlap.duplicated >= 40;
    findings.push({
      id: "overlap-high",
      severity: strong ? "high" : "medium",
      axis: "overlap",
      title: `${overlap.a.label} et ${overlap.b.label} se recouvrent à ${PERCENT(overlap.overlap * 100)}`,
      detail: `${PERCENT(overlap.duplicated)} du portefeuille tient dans cette exposition dupliquée. Détenir les deux revient à surpondérer ce qu'ils ont en commun, sans que le portefeuille en paraisse plus étroit sur le papier.`,
      action:
        "Soit assumer le pari et le formuler comme tel, soit remplacer la ligne redondante par une exposition absente du portefeuille.",
    });
  }

  // --- Géographie ----------------------------------------------------------
  const geoAxis = axis("geography");
  if (dominantGeo && geoAxis?.value !== null && geoAxis && geoAxis.value >= 70) {
    const extreme = geoAxis.value >= 85;
    findings.push({
      id: "geo-concentrated",
      severity: extreme ? "high" : "medium",
      axis: "geography",
      title: `${PERCENT(geoAxis.value)} du portefeuille est exposé à un seul pays : ${dominantGeo.category}`,
      detail: extreme
        ? "À ce niveau, le portefeuille n'est pas diversifié géographiquement : c'est un placement sur un pays, avec un peu de décor autour. Une décennie perdue sur ce marché serait une décennie perdue tout court."
        : "C'est au-dessus du poids de ce pays dans le marché mondial. L'écart est un pari, qui peut être délibéré — mais il doit être conscient.",
      action:
        "Ajouter une poche hors de cette zone : marchés émergents, Europe, ou un ETF monde hors États-Unis.",
    });
  }

  // --- Secteurs ------------------------------------------------------------
  const sectorAxis = axis("sector");
  if (
    dominantSector &&
    sectorAxis &&
    sectorAxis.value !== null &&
    sectorAxis.value >= 30
  ) {
    findings.push({
      id: "sector-concentrated",
      severity: sectorAxis.value >= 40 ? "high" : "medium",
      axis: "sector",
      title: `${PERCENT(sectorAxis.value)} de la poche actions est sur un seul secteur : ${dominantSector.category}`,
      detail:
        "Une concentration sectorielle de ce niveau ne vient presque jamais d'un choix : elle est héritée des indices, qui suivent les capitalisations et amplifient donc le secteur du moment.",
      action:
        "Ajouter une zone au profil sectoriel différent — l'Europe est nettement plus industrielle et financière, moins technologique.",
    });
  }

  // --- Taille --------------------------------------------------------------
  const sizeAxis = axis("size");
  if (sizeAxis && sizeAxis.value !== null && sizeAxis.value < 15) {
    const none = sizeAxis.value < 8;
    findings.push({
      id: "size-missing",
      severity: none ? "high" : "medium",
      axis: "size",
      title: none
        ? "La poche actions ne contient que de grandes capitalisations"
        : `Seulement ${PERCENT(sizeAxis.value)} de moyennes et petites capitalisations`,
      detail:
        "Les indices « monde » les plus répandus s'arrêtent par construction aux grandes et moyennes valeurs. Environ un septième du marché mondial investissable reste dehors, sans que le nom de l'indice le laisse deviner.",
      action:
        "Ajouter 5 à 10 % d'un ETF petites capitalisations, ou remplacer le socle par un indice IMI qui couvre le marché entier.",
    });
  }

  // --- Ligne étroite dominante ---------------------------------------------
  const biggest = [...holdings].sort((a, b) => b.weight - a.weight)[0];
  if (biggest && biggest.weight >= 0.4 && isNarrow(biggest)) {
    findings.push({
      id: "narrow-line-dominant",
      severity: biggest.weight >= 0.6 ? "high" : "medium",
      axis: null,
      title: `${biggest.label} pèse ${PERCENT(biggest.weight * 100)} du portefeuille`,
      detail:
        "Cette ligne concentre à la fois un pays et un métier. Son sort et celui du portefeuille sont largement le même, et aucune des répartitions ci-dessus ne le dit vraiment.",
      action:
        "Ramener cette ligne au rang de satellite — rarement plus de 10 à 15 % — et confier le socle à un support large.",
    });
  }

  // --- Corrélation ---------------------------------------------------------
  const correlationAxis = axis("correlation");
  if (
    correlationAxis &&
    correlationAxis.value !== null &&
    correlationAxis.value >= 0.88
  ) {
    findings.push({
      id: "correlation-high",
      severity: "medium",
      axis: "correlation",
      title: `Vos lignes ont évolué presque à l'identique (corrélation ${correlationAxis.value.toFixed(2)})`,
      detail:
        "Sur la période testée, elles ont monté et baissé ensemble. Le portefeuille compte plusieurs lignes mais n'a, dans les faits, qu'un seul moteur de performance et un seul moteur de risque.",
      action:
        "Chercher la décorrélation ailleurs que dans une autre poche actions : obligations, or, ou une zone géographique franchement distincte.",
    });
  }

  // --- Qualité de la donnée ------------------------------------------------
  // En dernier, et en simple information : ce n'est pas un défaut du
  // portefeuille mais une limite du diagnostic. La taire laisserait croire que
  // l'analyse porte sur l'intégralité de l'allocation.
  const undocumented = holdings.filter(
    (h) => h.geoBreakdown === null && h.sectorBreakdown === null,
  );
  if (undocumented.length > 0) {
    const share = undocumented.reduce((sum, h) => sum + h.weight, 0) * 100;
    findings.push({
      id: "data-missing",
      severity: "info",
      axis: null,
      title: `${undocumented.length} support${undocumented.length > 1 ? "s" : ""} sans décomposition connue, soit ${PERCENT(share)} du portefeuille`,
      detail: `Ajoutés hors catalogue, ${undocumented.map((h) => h.label).join(", ")} n'${undocumented.length > 1 ? "ont" : "a"} ni répartition géographique ni répartition sectorielle publiée ici. Le diagnostic ci-dessus ne porte pas sur cette part.`,
      action:
        "En tenir compte à la lecture : les notes sont calculées sur le reste du portefeuille.",
    });
  }

  return findings.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}
