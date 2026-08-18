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
 * Compacte par nécessité : l'écran ne doit pas défiler avec une dizaine
 * d'actifs. Chaque ligne tient sur 36 pixels et porte tout ce qui est
 * nécessaire à une décision — nom, enveloppe, frais, poids.
 */
export function AssetRow({
  asset,
  color,
  onWeightChange,
  onRemove,
}: {
  asset: EditorAsset;
  color: string;
  onWeightChange: (weightPercent: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border px-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />

      <span className="min-w-0 flex-1 truncate text-sm" title={asset.shortLabel}>
        {asset.shortLabel}
      </span>

      {asset.dataPartial && (
        <span
          className="shrink-0 text-[11px] text-muted-foreground"
          title="Actif hors catalogue : ni répartition sectorielle, ni éligibilité PEA connue"
        >
          partiel
        </span>
      )}

      <PeaBadge eligible={asset.peaEligible} />

      <span className="tnum w-14 shrink-0 text-right text-xs text-muted-foreground">
        {asset.ter === null ? "—" : formatPercent(asset.ter)}
      </span>

      <div className="relative w-[86px] shrink-0">
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
          className="tnum h-7 pr-6 text-right"
          aria-label={`Poids de ${asset.shortLabel} en pourcentage`}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={onRemove}
        aria-label={`Retirer ${asset.shortLabel}`}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
