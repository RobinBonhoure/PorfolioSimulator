"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/utils/format";
import {
  LOSS_REACTION_LABELS,
  PRIORITY_LABELS,
  type LossReaction,
  type Priority,
  type WizardProfile,
} from "@/lib/wizard/profile";

type Patch = (update: Partial<WizardProfile>) => void;

/** Option cliquable en pleine largeur : libellé, explication, état sélectionné. */
function ChoiceCard({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "hover:border-foreground/20 hover:bg-secondary/40",
      )}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) onChange(Math.max(0, parsed));
          }}
          className="tnum pr-7 text-right"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          €
        </span>
      </div>
    </div>
  );
}

export function StepProject({
  profile,
  patch,
}: {
  profile: WizardProfile;
  patch: Patch;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="horizon" className="text-sm font-medium">
            Dans combien de temps aurez-vous besoin de cet argent ?
          </Label>
          <span className="tnum text-sm font-semibold">
            {profile.horizonYears} an{profile.horizonYears > 1 ? "s" : ""}
          </span>
        </div>
        <Slider
          id="horizon"
          min={1}
          max={40}
          step={1}
          value={[profile.horizonYears]}
          onValueChange={([horizonYears]) => patch({ horizonYears })}
        />
        <p className="text-xs text-muted-foreground">
          C&apos;est la réponse qui pèse le plus lourd. Elle détermine à elle
          seule la part d&apos;actions de départ — en dessous de trois ans, une
          baisse de marché n&apos;a pas le temps d&apos;être effacée.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="age" className="text-xs text-muted-foreground">
            Votre âge
          </Label>
          <Input
            id="age"
            type="number"
            inputMode="numeric"
            min={18}
            max={100}
            value={profile.age}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isNaN(parsed)) patch({ age: parsed });
            }}
            className="tnum text-right"
          />
        </div>
        <AmountField
          id="initial"
          label="Capital de départ"
          value={profile.initialAmount}
          onChange={(initialAmount) => patch({ initialAmount })}
          step={500}
        />
        <AmountField
          id="monthly"
          label="Versement mensuel"
          value={profile.monthlyContribution}
          onChange={(monthlyContribution) => patch({ monthlyContribution })}
          step={50}
        />
      </div>

      <p className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
        Sur {profile.horizonYears} an{profile.horizonYears > 1 ? "s" : ""}, vous
        auriez versé{" "}
        <span className="tnum font-medium text-foreground">
          {formatEur(
            profile.initialAmount +
              profile.monthlyContribution * 12 * profile.horizonYears,
          )}
        </span>{" "}
        au total, hors performance.
      </p>
    </div>
  );
}

export function StepTemperament({
  profile,
  patch,
}: {
  profile: WizardProfile;
  patch: Patch;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Votre portefeuille perd 30 % en quelques mois. Que faites-vous ?
        </p>
        <p className="text-xs text-muted-foreground">
          Une baisse de cette ampleur s&apos;est produite en 2008, en 2020 et en
          2022. La question n&apos;est pas de savoir si elle se reproduira, mais
          ce que vous ferez ce jour-là.
        </p>
        <div className="grid gap-2">
          {(Object.keys(LOSS_REACTION_LABELS) as LossReaction[]).map((key) => (
            <ChoiceCard
              key={key}
              label={LOSS_REACTION_LABELS[key].label}
              hint={LOSS_REACTION_LABELS[key].hint}
              selected={profile.lossReaction === key}
              onSelect={() => patch({ lossReaction: key })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t pt-5">
        <p className="text-sm font-medium">Que cherchez-vous en priorité ?</p>
        <div className="grid gap-2">
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((key) => (
            <ChoiceCard
              key={key}
              label={PRIORITY_LABELS[key].label}
              hint={PRIORITY_LABELS[key].hint}
              selected={profile.priority === key}
              onSelect={() => patch({ priority: key })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StepSupports({
  profile,
  patch,
}: {
  profile: WizardProfile;
  patch: Patch;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Le socle actions et obligations est constitué automatiquement. Ces deux
        poches sont facultatives et se prélèvent sur la part actions — ce sont
        des actifs risqués, les financer avec la poche obligataire fausserait
        l&apos;équilibre.
      </p>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="gold" className="flex-1 cursor-pointer font-normal">
            <span className="block text-sm font-medium">Or — 10 %</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Peu corrélé aux actions et souvent recherché lors des crises. Ne
              produit aucun revenu : sa performance ne vient que du prix.
            </span>
          </Label>
          <Switch
            id="gold"
            checked={profile.includeGold}
            onCheckedChange={(includeGold) => patch({ includeGold })}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="crypto" className="flex-1 cursor-pointer font-normal">
            <span className="block text-sm font-medium">Bitcoin — 5 % maximum</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              La ligne la plus volatile du catalogue, avec des baisses passées
              dépassant 80 %. Plafonnée à 5 %, et écartée des allocations
              défensives où elle contredirait l&apos;objectif.
            </span>
          </Label>
          <Switch
            id="crypto"
            checked={profile.includeCrypto}
            onCheckedChange={(includeCrypto) => patch({ includeCrypto })}
          />
        </div>
      </div>
    </div>
  );
}
