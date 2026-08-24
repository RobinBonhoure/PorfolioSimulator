"use client";

import type { StrategyHolding } from "@/lib/db/queries/strategies";
import { buildAssetPalette } from "@/lib/utils/asset-palette";
import { formatPercent } from "@/lib/utils/format";

/**
 * Composition d'une stratégie, en une bande et une légende.
 *
 * Les couleurs viennent de la palette indexée sur l'identifiant d'actif : un
 * même support garde donc sa teinte d'un écran à l'autre, de la liste au
 * graphique de l'espace de travail. C'est ce qui permet de reconnaître une
 * ligne sans lire son nom.
 *
 * Au-delà de `maxRows` lignes, le reste est regroupé plutôt que tronqué : une
 * liste coupée laisserait croire que la stratégie s'arrête là.
 *
 * Uniquement des `span` en affichage bloc, et non une vraie liste : le composant
 * est inséré dans le bouton d'une ligne du sélecteur de comparaison, dont le
 * modèle de contenu n'admet pas de `div` ni de `ul`. La sémantique de liste s'y
 * perdrait de toute façon — le bouton est le seul élément interactif, et son
 * libellé accessible reprend l'ensemble.
 */
export function HoldingsBar({
  holdings,
  maxRows = 4,
  compact = false,
}: {
  holdings: StrategyHolding[];
  maxRows?: number;
  /** Bande seule, sans légende : pour les colonnes trop étroites. */
  compact?: boolean;
}) {
  if (holdings.length === 0) return null;

  const palette = buildAssetPalette(holdings.map((h) => h.assetId));

  const shown = holdings.slice(0, maxRows);
  const rest = holdings.slice(maxRows);
  const restWeight = rest.reduce((total, h) => total + h.weight, 0);

  return (
    <span className="block space-y-1.5">
      <span className="flex h-1.5 overflow-hidden rounded-full">
        {holdings.map((holding) => (
          <span
            key={holding.assetId}
            title={`${holding.shortLabel} · ${formatPercent(holding.weight, 0)}`}
            style={{
              width: `${holding.weight * 100}%`,
              backgroundColor: palette.get(holding.assetId),
            }}
            // Un filet de fond entre les segments : sans lui, deux teintes
            // voisines se lisent comme une seule bande.
            className="border-r border-card last:border-r-0"
          />
        ))}
      </span>

      {!compact && (
        <span className="block space-y-0.5 text-[11px]">
          {shown.map((holding) => (
            <span
              key={holding.assetId}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: palette.get(holding.assetId) }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {holding.shortLabel}
              </span>
              <span className="tnum shrink-0">
                {formatPercent(holding.weight, 0)}
              </span>
            </span>
          ))}

          {rest.length > 0 && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="size-2 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                et {rest.length} autre{rest.length > 1 ? "s" : ""}
              </span>
              <span className="tnum shrink-0">
                {formatPercent(restWeight, 0)}
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
