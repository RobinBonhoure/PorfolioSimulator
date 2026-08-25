"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { StrategyFormValues } from "@/lib/validation/strategy.schema";

/**
 * Contrôles partagés entre l'écran de composition (large) et les colonnes de
 * paramètres des espaces de travail (étroites, ~340 px) : mêmes composants,
 * même largeur bornée (`max-w-xs`), pour qu'un réglage se présente à
 * l'identique quelle que soit la largeur du conteneur qui l'accueille.
 *
 * Une tentative précédente remplaçait le menu déroulant de la périodicité par
 * des pastilles : à cinq options, elles passaient sur deux lignes dans la
 * colonne étroite. Un menu déroulant reste la seule forme qui tienne sur une
 * ligne quel que soit le nombre d'options ; la seule chose à soigner est son
 * habillage — bord épais, coins ronds — pour qu'il ne se lise plus comme le
 * contrôle par défaut du navigateur.
 */

export const PERIOD_OPTIONS: {
  value: StrategyFormValues["rebalancing"]["period"];
  label: string;
}[] = [
  { value: "none", label: "Aucun" },
  { value: "monthly", label: "Mensuel" },
  { value: "quarterly", label: "Trimestriel" },
  { value: "semiannual", label: "Semestriel" },
  { value: "annual", label: "Annuel" },
];

export const BENCHMARK_OPTIONS = [
  { value: "CW8.PA", label: "MSCI World" },
  { value: "ESE.PA", label: "S&P 500" },
  { value: "__none__", label: "Aucun" },
];

/** Réglage à choix fermé : libellé à gauche, menu déroulant à droite, sur une
 *  seule ligne quel que soit le nombre d'options ou la largeur disponible. */
export function ChoiceField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div className="flex max-w-xs items-center justify-between gap-3">
      <Label className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger className="h-9 w-36 rounded-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Réglage à bascule : texte (libellé et repère) à gauche, interrupteur à
 *  droite — deux éléments distincts, pas un contour qui les regroupe. */
export function ToggleField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex max-w-xs items-center justify-between gap-3">
      <Label htmlFor={id} className="flex-1 text-xs font-normal">
        <span className="block">{label}</span>
        {hint && (
          <span className="block text-[11px] text-muted-foreground">
            {hint}
          </span>
        )}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Champ de montant compact : libellé au-dessus, valeur alignée à droite,
 *  unité en suffixe — pour les réglages numériques secondaires d'une section. */
export function MiniField({
  id,
  label,
  value,
  onChange,
  suffix,
  step,
  min = 0,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="w-28 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) onChange(Math.max(min, parsed));
          }}
          className="tnum h-9 pr-8 text-right"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}
