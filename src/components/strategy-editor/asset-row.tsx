"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPercent } from "@/lib/utils/format";
import { PeaBadge } from "./pea-badge";
import type { EditorAsset } from "./types";

/**
 * Ligne d'actif de l'allocation.
 *
 * Deux mises en page, parce que la place disponible varie du simple au triple
 * selon l'écran. Sur une seule ligne, les éléments fixes — pastille, badge PEA,
 * frais, champ de poids, bouton de retrait — occupent près de 280 pixels : dans
 * une colonne latérale, il ne reste rien pour le nom, qui est pourtant la seule
 * information qu'on cherche. La variante empilée donne au nom toute la première
 * ligne et renvoie les chiffres à la seconde.
 */
export function AssetRow({
  asset,
  color,
  onWeightChange,
  onRemove,
  stacked = false,
}: {
  asset: EditorAsset;
  color: string;
  onWeightChange: (weightPercent: number) => void;
  onRemove: () => void;
  /** Nom sur une ligne, chiffres sur la suivante. Nécessaire dès que la
   *  largeur disponible passe sous ~420 pixels. */
  stacked?: boolean;
}) {
  const dot = (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-sm"
      style={{ backgroundColor: color }}
    />
  );

  const label = (
    <span className="min-w-0 flex-1 truncate text-sm font-bold" title={asset.shortLabel}>
      {asset.shortLabel}
    </span>
  );

  const partial = asset.dataPartial && (
    <span
      className="shrink-0 text-[11px] text-muted-foreground"
      title="Actif hors catalogue : ni répartition sectorielle, ni éligibilité PEA connue"
    >
      partiel
    </span>
  );

  const ter = (
    <span className="tnum shrink-0 text-xs text-muted-foreground">
      {asset.ter === null ? "—" : formatPercent(asset.ter)}
    </span>
  );

  // Largeur calée sur le pire cas réel : un sixième de portefeuille s'écrit
  // « 16,67 », soit cinq caractères. Le rembourrage gauche par défaut de
  // `Input` est réduit — devant un nombre aligné à droite, il ne sert à rien et
  // c'est lui qui faisait sauter le dernier chiffre.
  const weightInput = (
    <div className={`relative shrink-0 ${stacked ? "w-[84px]" : "w-[86px]"}`}>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.5}
        value={asset.weightPercent === 0 ? "" : asset.weightPercent}
        placeholder="0"
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = raw === "" ? 0 : Number(raw);
          if (Number.isNaN(parsed)) return;
          onWeightChange(Math.min(100, Math.max(0, parsed)));
        }}
        className="tnum h-8 pl-1.5 pr-5 text-right"
        aria-label={`Poids de ${asset.shortLabel} en pourcentage`}
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        %
      </span>
    </div>
  );

  const removeButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`shrink-0 ${stacked ? "size-6" : "size-7"}`}
      onClick={onRemove}
      aria-label={`Retirer ${asset.shortLabel}`}
    >
      <X className="size-3.5" />
    </Button>
  );

  if (stacked) {
    return (
      <div className="rounded-xl border bg-white px-2 py-1.5 dark:bg-input/20">
        <div className="flex items-center gap-2">
          {dot}
          {label}
          {removeButton}
        </div>
        <div className="mt-1 flex items-center gap-1.5 pl-[18px]">
          <PeaBadge eligible={asset.peaEligible} />
          {partial}
          {ter}
          <div className="ml-auto">{weightInput}</div>
        </div>
      </div>
    );
  }

  const subtitle = [
    asset.name,
    asset.ter === null ? null : `${formatPercent(asset.ter)} de frais par an`,
    asset.dataPartial ? "données partielles" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 dark:bg-input/20">
      {dot}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold" title={asset.shortLabel}>
          {asset.shortLabel}
        </span>
        <span className="block truncate text-xs text-muted-foreground" title={subtitle}>
          {subtitle}
        </span>
      </span>
      <PeaBadge eligible={asset.peaEligible} />
      {weightInput}
      {removeButton}
    </div>
  );
}
