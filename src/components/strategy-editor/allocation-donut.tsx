"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { buildAssetPalette } from "@/lib/utils/asset-palette";
import { formatPercent } from "@/lib/utils/format";
import type { EditorAsset } from "./types";

/**
 * Donut d'allocation.
 *
 * Une part-de-tout sur un petit nombre de catégories est l'un des rares cas où
 * la forme circulaire se lit bien. Elle reste néanmoins secondaire : la liste
 * d'actifs à côté porte les libellés et les valeurs exactes, le donut ne sert
 * qu'à donner la silhouette de l'allocation d'un coup d'œil. La pastille de
 * couleur de chaque ligne tient lieu de légende, si bien que l'identité d'une
 * part ne repose jamais sur la couleur seule.
 *
 * Un liseré de la couleur du fond sépare les parts : sans lui, deux teintes
 * voisines se touchent et la frontière devient illisible.
 */
export function AllocationDonut({
  assets,
  size = 168,
}: {
  assets: readonly EditorAsset[];
  size?: number;
}) {
  const palette = buildAssetPalette(assets.map((a) => a.assetId));
  const total = assets.reduce((sum, a) => sum + a.weightPercent, 0);

  const data = assets
    .filter((asset) => asset.weightPercent > 0)
    .map((asset) => ({
      name: asset.shortLabel,
      value: asset.weightPercent,
      color: palette.get(asset.assetId)!,
    }));

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        Allocation
        <br />à composer
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={1}
            startAngle={90}
            endAngle={-270}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`tnum text-lg font-semibold ${
            Math.abs(total - 100) < 0.01 ? "" : "text-[var(--neg-text)]"
          }`}
        >
          {formatPercent(total / 100, total % 1 === 0 ? 0 : 2)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {assets.length} actif{assets.length > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
