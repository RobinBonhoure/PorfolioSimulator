"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { StrategyFormValues } from "@/lib/validation/strategy.schema";
import {
  BENCHMARK_OPTIONS,
  ChoiceField,
  MiniField,
  PERIOD_OPTIONS,
  ToggleField,
} from "./controls";

/**
 * Colonne de paramètres.
 *
 * Tout doit tenir sans défilement sur un écran 1080p, d'où les champs sur une
 * seule ligne, les libellés courts et la section des frais repliée par défaut :
 * elle a des valeurs par défaut réalistes, et la majorité des utilisateurs n'y
 * touchera jamais.
 *
 * Rééquilibrage, frais et analyse partagent leurs contrôles avec l'écran de
 * composition (`./controls`) : même menu déroulant pour un choix fermé, même
 * interrupteur pour une bascule, à la même largeur bornée — un réglage se
 * présente à l'identique quelle que soit la colonne qui l'accueille.
 */

/** Champ numérique aligné à droite, avec son unité en suffixe. Réservé à
 *  « Votre plan », dont la disposition en ligne (libellé à gauche, valeur à
 *  droite) reste distincte des champs compacts des sections repliables. */
function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  step = 1,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="relative w-[120px]">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={0}
          step={step}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          className="tnum h-9 pr-7 text-right"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function SidebarParams({
  values,
  onChange,
  includeName = true,
  includeInvestment = true,
  includeTaxation = true,
  includeBenchmark = true,
}: {
  values: StrategyFormValues;
  onChange: (patch: Partial<StrategyFormValues>) => void;
  /** Mettre à faux quand le nom est saisi ailleurs — l'écran de création lui
   *  donne sa propre place, en tête de page. */
  includeName?: boolean;
  /** Mettre à faux quand montants et durée sont saisis ailleurs. L'écran de
   *  composition les met en évidence dans sa carte « Votre plan » : les
   *  répéter ici donnerait deux contrôles pour une même valeur. */
  includeInvestment?: boolean;
  /** L'écran de comparaison n'affiche ni fiscalité ni référence : un réglage
   *  visible qui ne change rien à l'écran est pire qu'un réglage absent. */
  includeTaxation?: boolean;
  includeBenchmark?: boolean;
}) {
  return (
    <div className="space-y-4">
      {includeName && (
        <div className="space-y-1.5">
          <Label
            htmlFor="strategy-name"
            className="text-xs text-muted-foreground"
          >
            Nom de la stratégie
          </Label>
          <Input
            id="strategy-name"
            value={values.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Ex. World + émergents"
            className="h-9"
          />
        </div>
      )}

      {includeInvestment && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Votre plan
          </h2>
          <NumberField
            id="initial-amount"
            label="Capital initial"
            value={values.initialAmount}
            onChange={(initialAmount) => onChange({ initialAmount })}
            suffix="€"
            step={500}
          />
          <NumberField
            id="monthly-contribution"
            label="Chaque mois"
            value={values.monthlyContribution}
            onChange={(monthlyContribution) =>
              onChange({ monthlyContribution })
            }
            suffix="€"
            step={50}
          />

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="years"
                className="text-xs font-normal text-muted-foreground"
              >
                Durée du backtest
              </Label>
              <span className="tnum text-xs">
                {values.years} an{values.years > 1 ? "s" : ""}
              </span>
            </div>
            <Slider
              id="years"
              min={1}
              max={30}
              step={1}
              value={[values.years]}
              onValueChange={([years]) => onChange({ years })}
            />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rééquilibrage
        </h2>

        <ChoiceField
          label="Périodicité"
          value={values.rebalancing.period}
          onChange={(period) =>
            onChange({ rebalancing: { ...values.rebalancing, period } })
          }
          options={PERIOD_OPTIONS}
        />

        <ToggleField
          id="threshold-enabled"
          label="Sur dérive"
          hint="Se cumule avec la périodicité"
          checked={values.rebalancing.thresholdEnabled}
          onChange={(thresholdEnabled) =>
            onChange({
              rebalancing: { ...values.rebalancing, thresholdEnabled },
            })
          }
        />

        {values.rebalancing.thresholdEnabled && (
          <MiniField
            id="threshold-points"
            label="Écart toléré"
            value={values.rebalancing.thresholdPoints}
            onChange={(thresholdPoints) =>
              onChange({
                rebalancing: { ...values.rebalancing, thresholdPoints },
              })
            }
            suffix="pts"
            step={1}
            min={1}
            max={50}
          />
        )}
      </section>

      <Accordion type="single" collapsible>
        <AccordionItem value="fees" className="border-b-0">
          <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
            Frais
          </AccordionTrigger>
          <AccordionContent className="space-y-2.5 pb-1">
            <div className="grid grid-cols-2 gap-2">
              <MiniField
                id="brokerage-percent"
                label="Courtage par ordre"
                value={values.fees.brokeragePercent}
                onChange={(brokeragePercent) =>
                  onChange({ fees: { ...values.fees, brokeragePercent } })
                }
                suffix="%"
                step={0.05}
              />
              <MiniField
                id="brokerage-min"
                label="Minimum par ordre"
                value={values.fees.brokerageMinEur}
                onChange={(brokerageMinEur) =>
                  onChange({ fees: { ...values.fees, brokerageMinEur } })
                }
                suffix="€"
                step={0.5}
              />
              <MiniField
                id="spread-percent"
                label="Spread"
                value={values.fees.spreadPercent}
                onChange={(spreadPercent) =>
                  onChange({ fees: { ...values.fees, spreadPercent } })
                }
                suffix="%"
                step={0.05}
              />
            </div>
            <ToggleField
              id="apply-ter"
              label="Frais courants (TER)"
              hint="Prélevés chaque jour sur l'encours"
              checked={values.fees.applyTer}
              onChange={(applyTer) =>
                onChange({ fees: { ...values.fees, applyTer } })
              }
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Analyse
        </h2>
        <ToggleField
          id="real-returns"
          label="Rendement réel"
          hint="Déflaté de l'inflation"
          checked={values.realReturns}
          onChange={(realReturns) => onChange({ realReturns })}
        />
        {includeTaxation && (
          <ToggleField
            id="taxation"
            label="Fiscalité à la sortie"
            hint="PEA contre compte-titres"
            checked={values.taxation}
            onChange={(taxation) => onChange({ taxation })}
          />
        )}

        {includeBenchmark && (
          <ChoiceField
            label="Référence"
            value={values.benchmark ?? "__none__"}
            onChange={(value) =>
              onChange({ benchmark: value === "__none__" ? null : value })
            }
            options={BENCHMARK_OPTIONS}
          />
        )}
      </section>
    </div>
  );
}
