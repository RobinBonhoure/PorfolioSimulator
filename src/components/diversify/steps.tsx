"use client";

import { Check, TriangleAlert } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import {
  BRICKS,
  CORE_OPTIONS,
  ENVELOPES,
  REGION_BRICKS,
  SIZE_BRICKS,
  isAvailable,
  type Allocation,
  type BrickId,
  type Envelope,
} from "@/lib/diversify/blocks";
import { cn } from "@/lib/utils";

/**
 * Étapes du parcours de diversification.
 *
 * Chaque étape porte **une** décision et l'explique, plutôt que d'aligner des
 * curseurs. Le verdict de robustesse étant recalculé en direct à côté, l'effet
 * de chaque mouvement se lit immédiatement — c'est là qu'est la pédagogie du
 * parcours, davantage que dans les textes.
 */

function Choice({
  selected,
  disabled,
  onSelect,
  title,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border-2 p-3.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-secondary/50",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
        >
          {selected && <Check className="size-2.5 text-primary-foreground" />}
        </span>
        <span className="text-sm font-bold">{title}</span>
      </span>
      <span className="mt-1.5 block space-y-1 pl-6">{children}</span>
    </button>
  );
}

export function StepEnvelope({
  allocation,
  patch,
}: {
  allocation: Allocation;
  patch: (update: Partial<Allocation>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-bold">Dans quelle enveloppe ?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cette question vient en premier parce qu&apos;elle décide de ce
          qu&apos;il sera possible de construire ensuite, pas seulement de la
          fiscalité à la sortie.
        </p>
      </div>

      <div className="space-y-2.5">
        {(Object.keys(ENVELOPES) as Envelope[]).map((envelope) => (
          <Choice
            key={envelope}
            selected={allocation.envelope === envelope}
            onSelect={() => patch({ envelope })}
            title={ENVELOPES[envelope].label}
          >
            <span className="block text-xs text-muted-foreground">
              {ENVELOPES[envelope].hint}
            </span>
          </Choice>
        ))}
      </div>

      {allocation.envelope === "pea" && (
        <p className="flex gap-2 rounded-xl border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-xs leading-snug">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--score-3)]" />
          <span>
            <span className="font-bold">
              Aucun ETF petites capitalisations n&apos;est éligible au PEA,
            </span>{" "}
            ni aucun ETF « monde hors États-Unis ». Ce n&apos;est pas une lacune
            de ce catalogue mais l&apos;état de l&apos;offre française : le PEA
            permet de diversifier les zones, pas les tailles d&apos;entreprise.
            Le parcours reconstituera ce qu&apos;il peut avec l&apos;Europe et
            le Japon, et le dira quand il n&apos;y arrivera pas.
          </span>
        </p>
      )}
    </div>
  );
}

export function StepCore({
  allocation,
  patch,
}: {
  allocation: Allocation;
  patch: (update: Partial<Allocation>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-bold">Sur quel socle ?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Le socle porte la majorité du portefeuille. Tout le reste du parcours
          consiste à corriger ce qu&apos;il laisse de côté — autant savoir dès
          maintenant ce que c&apos;est.
        </p>
      </div>

      <div className="space-y-2.5">
        {CORE_OPTIONS.map((core) => {
          const available = core.envelopes.includes(allocation.envelope);
          return (
            <Choice
              key={core.id}
              selected={allocation.coreId === core.id}
              disabled={!available}
              onSelect={() => patch({ coreId: core.id })}
              title={core.label}
            >
              <span className="block text-xs text-muted-foreground">
                {core.description}
              </span>
              <span className="block text-xs">
                <span className="font-bold">Laisse dehors : </span>
                <span className="text-muted-foreground">{core.blindSpot}</span>
              </span>
              {!available && (
                <span className="block text-xs font-bold text-[var(--score-3)]">
                  Indisponible en {ENVELOPES[allocation.envelope].label}.
                </span>
              )}
            </Choice>
          );
        })}
      </div>
    </div>
  );
}

function BrickSlider({
  brick,
  allocation,
  patch,
  max,
}: {
  brick: BrickId;
  allocation: Allocation;
  patch: (update: Partial<Allocation>) => void;
  max: number;
}) {
  const definition = BRICKS[brick];
  const available = isAvailable(brick, allocation.envelope);
  const value = allocation.satellites[brick] ?? 0;

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border p-3.5",
        !available && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold">{definition.label}</span>
        <span className="tnum shrink-0 text-sm font-bold">
          {available ? `${value} %` : "—"}
        </span>
      </div>

      <p className="text-xs leading-snug text-muted-foreground">
        {definition.hint}
      </p>

      {available ? (
        <Slider
          value={[value]}
          min={0}
          max={max}
          step={1}
          onValueChange={([next]) =>
            patch({
              satellites: { ...allocation.satellites, [brick]: next },
            })
          }
        />
      ) : (
        <p className="text-xs font-bold text-[var(--score-3)]">
          Aucun support éligible au {ENVELOPES[allocation.envelope].label}.
        </p>
      )}
    </div>
  );
}

export function StepGeography({
  allocation,
  patch,
}: {
  allocation: Allocation;
  patch: (update: Partial<Allocation>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-bold">
          Rééquilibrer les zones
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ce que vous ajoutez ici est prélevé sur le socle, jamais ajouté en
          plus : diversifier ne consiste pas à investir davantage, mais à
          déplacer. Les marchés émergents pèsent environ un dixième de la
          capitalisation mondiale — c&apos;est le repère neutre, au-delà
          commence le pari.
        </p>
      </div>

      <div className="space-y-2.5">
        {REGION_BRICKS.map((brick) => (
          <BrickSlider
            key={brick}
            brick={brick}
            allocation={allocation}
            patch={patch}
            max={40}
          />
        ))}
      </div>
    </div>
  );
}

export function StepSize({
  allocation,
  patch,
}: {
  allocation: Allocation;
  patch: (update: Partial<Allocation>) => void;
}) {
  const blocked = SIZE_BRICKS.every(
    (brick) => !isAvailable(brick, allocation.envelope),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-bold">
          Descendre en taille d&apos;entreprise
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Les indices « monde » s&apos;arrêtent aux grandes et moyennes valeurs.
          Les petites représentent environ un septième du marché mondial
          investissable, et ne se comportent pas comme le reste — c&apos;est la
          diversification que personne ne mentionne.
        </p>
      </div>

      <div className="space-y-2.5">
        {SIZE_BRICKS.map((brick) => (
          <BrickSlider
            key={brick}
            brick={brick}
            allocation={allocation}
            patch={patch}
            max={25}
          />
        ))}
      </div>

      {blocked && (
        <p className="flex gap-2 rounded-xl border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-xs leading-snug">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--score-3)]" />
          <span>
            Cet axe est fermé en {ENVELOPES[allocation.envelope].label}. Le
            portefeuille restera noté « Absente » sur la taille, et c&apos;est
            un constat exact plutôt qu&apos;un défaut de construction. Y remédier
            suppose d&apos;ouvrir un compte-titres à côté, pour cette poche
            seule.
          </span>
        </p>
      )}
    </div>
  );
}
