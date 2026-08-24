"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import type { StrategyFormValues } from "@/lib/validation/strategy.schema";

/**
 * Colonne de paramètres.
 *
 * Tout doit tenir sans défilement sur un écran 1080p, d'où les champs sur une
 * seule ligne, les libellés courts et la section des frais repliée par défaut :
 * elle a des valeurs par défaut réalistes, et la majorité des utilisateurs n'y
 * touchera jamais.
 */

const PERIOD_LABELS: Record<StrategyFormValues["rebalancing"]["period"], string> = {
  none: "Aucun",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  semiannual: "Semestriel",
  annual: "Annuel",
};

const BENCHMARKS = [
  { value: "CW8.PA", label: "MSCI World" },
  { value: "ESE.PA", label: "S&P 500" },
  { value: "__none__", label: "Aucun" },
];

/** Champ numérique aligné à droite, avec son unité en suffixe. */
function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step?: number;
  min?: number;
  max?: number;
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
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          className="tnum h-8 pr-7 text-right"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="flex-1 text-xs font-normal">
        <span className="block">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SidebarParams({
  values,
  onChange,
  includeName = true,
  includeTaxation = true,
  includeBenchmark = true,
}: {
  values: StrategyFormValues;
  onChange: (patch: Partial<StrategyFormValues>) => void;
  /** Mettre à faux quand le nom est saisi ailleurs — l'écran de création lui
   *  donne sa propre place, en tête de page. */
  includeName?: boolean;
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
            className="h-8"
          />
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Investissement
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
          label="Versement mensuel"
          value={values.monthlyContribution}
          onChange={(monthlyContribution) => onChange({ monthlyContribution })}
          suffix="€"
          step={50}
        />

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="years" className="text-xs font-normal text-muted-foreground">
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

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rééquilibrage
        </h2>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-normal text-muted-foreground">
            Périodicité
          </Label>
          <Select
            value={values.rebalancing.period}
            onValueChange={(period) =>
              onChange({
                rebalancing: {
                  ...values.rebalancing,
                  period: period as StrategyFormValues["rebalancing"]["period"],
                },
              })
            }
          >
            <SelectTrigger className="h-8 w-[120px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ToggleRow
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
          <NumberField
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
          <AccordionContent className="space-y-2 pb-1">
            <NumberField
              id="brokerage-percent"
              label="Courtage par ordre"
              value={values.fees.brokeragePercent}
              onChange={(brokeragePercent) =>
                onChange({ fees: { ...values.fees, brokeragePercent } })
              }
              suffix="%"
              step={0.05}
            />
            <NumberField
              id="brokerage-min"
              label="Minimum par ordre"
              value={values.fees.brokerageMinEur}
              onChange={(brokerageMinEur) =>
                onChange({ fees: { ...values.fees, brokerageMinEur } })
              }
              suffix="€"
              step={0.5}
            />
            <NumberField
              id="spread-percent"
              label="Spread"
              value={values.fees.spreadPercent}
              onChange={(spreadPercent) =>
                onChange({ fees: { ...values.fees, spreadPercent } })
              }
              suffix="%"
              step={0.05}
            />
            <ToggleRow
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
        <ToggleRow
          id="real-returns"
          label="Rendement réel"
          hint="Déflaté de l'inflation"
          checked={values.realReturns}
          onChange={(realReturns) => onChange({ realReturns })}
        />
        {includeTaxation && (
          <ToggleRow
            id="taxation"
            label="Fiscalité à la sortie"
            hint="PEA contre compte-titres"
            checked={values.taxation}
            onChange={(taxation) => onChange({ taxation })}
          />
        )}

        {includeBenchmark && (
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-normal text-muted-foreground">
            Référence
          </Label>
          <Select
            value={values.benchmark ?? "__none__"}
            onValueChange={(value) =>
              onChange({ benchmark: value === "__none__" ? null : value })
            }
          >
            <SelectTrigger className="h-8 w-[120px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BENCHMARKS.map((benchmark) => (
                <SelectItem key={benchmark.value} value={benchmark.value}>
                  {benchmark.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}
      </section>
    </div>
  );
}
