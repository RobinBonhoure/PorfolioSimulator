"use client";

import { Info, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { ProjectionFanChart } from "@/components/charts/projection-fan-chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_PROJECTION,
  ProjectionError,
  RETURN_ASSUMPTIONS,
  meanReturnStandardError,
  runProjection,
} from "@/lib/engine/projection";
import type { BacktestMetrics } from "@/lib/engine/types";
import {
  formatEur,
  formatNumber,
  formatPercent,
  formatSignedEur,
} from "@/lib/utils/format";

/**
 * Projection d'une stratégie dans le futur.
 *
 * Le calcul tourne **dans le navigateur** : le moteur de projection est du
 * TypeScript pur sans dépendance, et deux mille trajectoires prennent quelques
 * millisecondes. L'utilisateur déplace l'horizon ou change d'hypothèse et
 * l'éventail se redessine aussitôt, sans aller-retour serveur.
 *
 * Les hypothèses sont affichées à côté du graphique, jamais renvoyées à une
 * note de bas de page : un éventail de projection ressemble à une prévision, et
 * la seule façon honnête de le présenter est de montrer en continu ce qu'il
 * suppose.
 */

const HISTORICAL_OPTION = "__historique__";

/** Au-delà de ce rapport entre 5e et 95e centile, l'échelle linéaire devient
 *  inutilisable et la projection cesse d'être informative. */
const EXTREME_SPREAD = 20;

/** Au-delà, un rendement annuel relève de l'artefact de période : aucune classe
 *  d'actifs n'a tenu un tel rythme sur plusieurs décennies. */
const IMPLAUSIBLE_RATE = 0.15;

export function ProjectionPanel({
  metrics,
  monthlyReturns,
  defaultInitialAmount,
  defaultMonthlyContribution,
  realCagr = null,
}: {
  metrics: BacktestMetrics;
  monthlyReturns: number[];
  /** Capital initial de la stratégie, repris tel quel comme point de départ. */
  defaultInitialAmount: number;
  defaultMonthlyContribution: number;
  /** Rendement annualisé en euros constants, renseigné seulement quand la
   *  stratégie est affichée en rendement réel. C'est alors ce chiffre-là que le
   *  reste de l'écran montre, et c'est donc lui que l'option « Du backtest »
   *  doit reprendre. */
  realCagr?: number | null;
}) {
  const [years, setYears] = useState(20);
  // Le plan d'investissement de la stratégie est repris tel quel : même mise
  // de départ, mêmes versements, projetés vers l'avant.
  //
  // Surtout pas la valeur finale du backtest — cela mélangerait le passé simulé
  // et le futur projeté, et ferait démarrer le graphique à plusieurs centaines
  // de milliers d'euros sans explication. Mais pas zéro non plus : une
  // stratégie dotée d'un capital initial et sans versement mensuel se
  // retrouverait sans aucun apport, donc sans rien à projeter.
  const [initialAmount, setInitialAmount] = useState(defaultInitialAmount);
  const [assumption, setAssumption] = useState<string>("0.07");
  const [contribution, setContribution] = useState(defaultMonthlyContribution);
  const [inRealTerms, setInRealTerms] = useState(true);
  // `null` signifie « laisser l'application décider » : l'échelle bascule en
  // logarithmique dès que l'éventail traverse plusieurs ordres de grandeur.
  // Toucher l'interrupteur fige le choix de l'utilisateur.
  // Le plan d'investissement suit celui de la stratégie. Sans cette
  // resynchronisation, porter le versement mensuel de 300 à 900 € dans la
  // colonne de gauche laissait la projection sur les 300 € du premier rendu :
  // les deux moitiés de l'écran décrivaient alors deux plans différents.
  // L'ajustement se fait pendant le rendu, et seulement quand la stratégie
  // change — une valeur saisie ici reste donc modifiable librement entre deux
  // changements.
  const [seenPlan, setSeenPlan] = useState({
    initialAmount: defaultInitialAmount,
    contribution: defaultMonthlyContribution,
  });
  if (
    seenPlan.initialAmount !== defaultInitialAmount ||
    seenPlan.contribution !== defaultMonthlyContribution
  ) {
    setSeenPlan({
      initialAmount: defaultInitialAmount,
      contribution: defaultMonthlyContribution,
    });
    setInitialAmount(defaultInitialAmount);
    setContribution(defaultMonthlyContribution);
  }

  const [logScaleOverride, setLogScaleOverride] = useState<boolean | null>(
    null,
  );

  // Taux de l'option « Du backtest » : le rendement annualisé affiché partout
  // ailleurs sur l'écran, et rien d'autre.
  //
  // Il valait d'abord la moyenne géométrique des rendements mensuels — une
  // grandeur voisine mais distincte du rendement annualisé, dont elle s'écartait
  // de quatre dixièmes de point. Puis, le rendement nominal alors que la
  // stratégie affichait du réel, soit deux points d'écart. Dans les deux cas le
  // symptôme est le même : deux nombres pour une seule grandeur, côte à côte.
  //
  // La règle est donc unique : reprendre le chiffre que le reste de l'écran
  // montre. Quand il est déjà net d'inflation, aucune inflation n'est appliquée
  // par-dessus — c'est ce que gère `appliedInflation` plus bas.
  const rateIsReal = realCagr !== null;
  const historicalRate = rateIsReal ? realCagr : metrics.cagr;

  const expectedAnnualReturn =
    assumption === HISTORICAL_OPTION ? historicalRate : Number(assumption);

  const selectedAssumption = RETURN_ASSUMPTIONS.find(
    (option) => String(option.value) === assumption,
  );


  // Un taux déjà net d'inflation ne doit pas être déflaté une seconde fois.
  // C'est le cas de l'option « Du backtest » quand la stratégie est affichée en
  // euros constants : la projection est alors réelle sans rien avoir à
  // retrancher.
  const rateAlreadyReal = rateIsReal && assumption === HISTORICAL_OPTION;
  const appliedInflation =
    rateAlreadyReal || !inRealTerms ? 0 : DEFAULT_PROJECTION.expectedInflation;

  const projection = useMemo(() => {
    try {
      return {
        value: runProjection(monthlyReturns, {
          ...DEFAULT_PROJECTION,
          initialAmount,
          monthlyContribution: contribution,
          years,
          expectedAnnualReturn,
          expectedInflation: appliedInflation,
        }),
        error: null as string | null,
      };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof ProjectionError
            ? error.message
            : "La projection n'a pas pu être calculée.",
      };
    }
  }, [
    monthlyReturns,
    initialAmount,
    contribution,
    years,
    expectedAnnualReturn,
    appliedInflation,
  ]);

  if (projection.error || !projection.value) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        {projection.error}
      </p>
    );
  }

  const result = projection.value;

  // La projection est en euros constants soit parce qu'on y retranche une
  // hypothèse d'inflation, soit parce que le taux de départ en était déjà net.
  const projectionIsReal = rateAlreadyReal || result.inRealTerms;

  // L'incertitude sur le rendement moyen mesuré : c'est le chiffre qui doit
  // accompagner toute tentation de reprendre le CAGR du backtest comme
  // hypothèse de projection.
  const standardError = meanReturnStandardError(
    metrics.volatility,
    metrics.effectiveYears,
  );

  const spread =
    result.terminal.p5 > 0 ? result.terminal.p95 / result.terminal.p5 : 0;

  const logScale = logScaleOverride ?? spread > EXTREME_SPREAD;

  // La courbe trace la valeur totale du portefeuille ; le gain en est la part
  // qui ne vient pas des versements.
  const medianGain = result.terminal.p50 - result.totalInvested;

  return (
    <div className="space-y-4">
      {/* Réglages.
          Chaque colonne suit la même ossature — une ligne d'étiquette de
          hauteur fixe, puis un contrôle de 32 pixels — sans quoi une étiquette
          qui passe sur deux lignes décale son champ par rapport aux voisins. */}
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <div className="flex h-5 items-center justify-between">
            <Label
              htmlFor="projection-years"
              className="text-xs text-muted-foreground"
            >
              Horizon
            </Label>
            <span className="tnum text-xs">{years} ans</span>
          </div>
          <div className="flex h-8 items-center">
            <Slider
              id="projection-years"
              min={1}
              max={40}
              step={1}
              value={[years]}
              onValueChange={([value]) => setYears(value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex h-5 items-center">
            <Label className="text-xs text-muted-foreground">
              Rendement supposé
            </Label>
          </div>
          <Select value={assumption} onValueChange={setAssumption}>
            <SelectTrigger className="h-8 w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETURN_ASSUMPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label} — {formatPercent(option.value, 0)}
                </SelectItem>
              ))}
              <SelectItem value={HISTORICAL_OPTION}>
                Du backtest — {formatPercent(historicalRate, 1)}
                {rateIsReal && " net d'inflation"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex h-5 items-center">
            <Label
              htmlFor="projection-contribution"
              className="text-xs text-muted-foreground"
            >
              Versement mensuel
            </Label>
          </div>
          <div className="relative">
            <Input
              id="projection-contribution"
              type="number"
              min={0}
              step={50}
              value={contribution}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isNaN(parsed) && parsed >= 0)
                  setContribution(parsed);
              }}
              className="tnum h-8 pr-7 text-right"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex h-5 items-center">
            <Label
              htmlFor="projection-initial"
              className="text-xs text-muted-foreground"
            >
              Capital de départ
            </Label>
          </div>
          <div className="relative">
            <Input
              id="projection-initial"
              type="number"
              min={0}
              step={1_000}
              value={initialAmount}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isNaN(parsed) && parsed >= 0)
                  setInitialAmount(parsed);
              }}
              className="tnum h-8 pr-7 text-right"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              €
            </span>
          </div>
        </div>
      </div>

      {/* L'écart, pas la médiane */}
      <div className="rounded-xl border p-4">
        <p className="text-sm">
          En démarrant aujourd&apos;hui
          {initialAmount > 0 ? ` avec ${formatEur(initialAmount)}` : " de zéro"}
          {contribution > 0 ? ` et ${formatEur(contribution)} par mois` : ""},
          cette allocation vaudrait dans {years} ans entre{" "}
          <span className="tnum font-semibold">
            {formatEur(result.terminal.p5)}
          </span>{" "}
          et{" "}
          <span className="tnum font-semibold">
            {formatEur(result.terminal.p95)}
          </span>{" "}
          dans 90 % des scénarios simulés
          {projectionIsReal ? ", en pouvoir d'achat d'aujourd'hui" : ""}. Ce
          sont des valeurs totales de portefeuille, versements compris.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Soit un rapport de {formatNumber(spread)} entre le pire et le meilleur
          cas. La médiane, à {formatEur(result.terminal.p50)}, a autant de
          chances d&apos;être dépassée que ratée : c&apos;est l&apos;écart qui
          informe, pas le chiffre central.
        </p>

        {spread > EXTREME_SPREAD && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-2.5 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--score-3)]" />
            <span>
              Cet éventail est si large qu&apos;il n&apos;apprend pas
              grand-chose : avec {formatPercent(metrics.volatility, 0)} de
              volatilité annuelle, l&apos;écart entre scénarios dépasse tout ce
              que l&apos;hypothèse de rendement peut nuancer. C&apos;est en soi
              le résultat — sur cet horizon, une stratégie aussi volatile rend
              toute projection chiffrée peu significative.
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4">
        <Label
          htmlFor="projection-real"
          className="flex items-center gap-2 text-xs font-normal"
        >
          <Switch
            id="projection-real"
            checked={rateAlreadyReal || inRealTerms}
            onCheckedChange={setInRealTerms}
            // Le taux du backtest est déjà net d'inflation quand la stratégie
            // est affichée en euros constants : il n'y a plus rien à retrancher,
            // et laisser le réglage actif inviterait à la déduire deux fois.
            disabled={rateAlreadyReal}
          />
          {rateAlreadyReal ? "Inflation (déjà déduite)" : "Inflation (2%)"}
        </Label>
        <Label
          htmlFor="projection-log"
          className="flex items-center gap-2 text-xs font-normal"
        >
          <Switch
            id="projection-log"
            checked={logScale}
            onCheckedChange={setLogScaleOverride}
          />
          Échelle logarithmique
        </Label>
      </div>

      <ProjectionFanChart
        projection={result}
        monthlyContribution={contribution}
        logScale={logScale}
      />

      {/* Décomposition du scénario médian.
          Les trois premières cartes se lisent comme une addition — capital
          engagé + gain = valeur totale — parce que la courbe trace la valeur
          du portefeuille, versements compris, et non le seul gain. Sans cette
          décomposition, il faut faire la soustraction de tête, avec en prime
          le piège du passage des euros courants aux euros constants. */}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Capital engagé</dt>
          <dd className="tnum text-lg font-semibold">
            {formatEur(result.totalInvested)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-muted-foreground">
            Départ et versements, en euros d&apos;aujourd&apos;hui
          </dd>
        </div>

        <div className="rounded-xl border px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Gain médian</dt>
          <dd
            className={`tnum text-lg font-semibold ${
              medianGain >= 0 ? "text-[var(--pos-text)]" : "text-[var(--neg-text)]"
            }`}
          >
            {formatSignedEur(medianGain)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-muted-foreground">
            Ce que le placement ajoute au capital engagé
          </dd>
        </div>

        <div className="rounded-xl border px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Valeur médiane</dt>
          <dd className="tnum text-lg font-semibold">
            {formatEur(result.terminal.p50)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-muted-foreground">
            Total du portefeuille, versements compris
          </dd>
        </div>

        <div className="rounded-xl border px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">
            Risque de perte
          </dt>
          <dd className="tnum text-lg font-semibold">
            {formatPercent(result.probabilityBelowInvested, 1)}
          </dd>
          <dd className="mt-0.5 text-[11px] text-muted-foreground">
            Scénarios finissant sous le capital engagé
          </dd>
        </div>
      </dl>

      {/* Hypothèses, en clair */}
      <div className="space-y-2 rounded-xl border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-xs">
        <p className="flex items-start gap-2 font-medium">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--score-3)]" />
          Ce que cette projection suppose
        </p>
        <ul className="ml-5 list-disc space-y-1 text-muted-foreground">
          <li>
            Un rendement annuel moyen de{" "}
            {formatPercent(result.appliedAnnualReturn)}, net de frais.{" "}
            {selectedAssumption
              ? selectedAssumption.description
              : rateIsReal
                ? "C'est le rythme mesuré sur le backtest de cette stratégie, déjà net d'inflation, prolongé tel quel. Aucune inflation n'est retranchée par-dessus."
                : "C'est le rythme mesuré sur le backtest de cette stratégie, prolongé tel quel."}
          </li>

          {/* Prolonger le rendement mesuré revient à parier que la période
              écoulée se répète. C'est déjà discutable en général ; au-delà de
              15 % par an, cela relève de l'artefact de période et mérite d'être
              dit sans détour. */}
          {expectedAnnualReturn === null && (
            <li
              className={
                historicalRate > IMPLAUSIBLE_RATE
                  ? "font-medium text-[var(--neg-text)]"
                  : undefined
              }
            >
              {historicalRate > IMPLAUSIBLE_RATE
                ? `Projeter ${formatPercent(historicalRate, 1)} par an sur ${years} ans n'a aucun sens : aucune classe d'actifs n'a tenu ce rythme sur une telle durée. Ce chiffre décrit une période passée particulière, pas une espérance de rendement.`
                : "Vous projetez le rythme de la période écoulée, ce qui suppose qu'elle se répète. Les repères génériques ci-dessus sont des hypothèses plus défendables."}
            </li>
          )}
          <li>
            Le backtest a mesuré {formatPercent(historicalRate)} sur{" "}
            {metrics.effectiveYears.toFixed(1).replace(".", ",")} ans, mais
            l&apos;erreur type sur cette moyenne vaut{" "}
            {formatPercent(standardError, 1)} : le rendement réellement espéré
            se situe, avec 95 % de confiance, entre{" "}
            {formatPercent(historicalRate - 1.96 * standardError)} et{" "}
            {formatPercent(historicalRate + 1.96 * standardError)}. C&apos;est
            pourquoi reprendre le rendement passé comme hypothèse est hasardeux.
          </li>
          <li>
            La dispersion est tirée de {result.observations} mois réellement
            survenus, rejoués par blocs d&apos;un an pour conserver
            l&apos;enchaînement des bonnes et des mauvaises périodes. Sur{" "}
            {years} ans, ces mêmes séquences sont donc réutilisées plusieurs
            fois.
          </li>
          <li>
            L&apos;historique disponible n&apos;a jamais contenu de décennie
            perdue à la japonaise. Le passé qui sert de matériau est lui-même un
            échantillon, et plutôt favorable.
          </li>
        </ul>
      </div>
    </div>
  );
}
