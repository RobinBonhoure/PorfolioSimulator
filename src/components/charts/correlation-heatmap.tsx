"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { CorrelationMatrix } from "@/lib/engine/analytics";
import { correlationColor } from "@/lib/utils/asset-palette";
import { formatRatio } from "@/lib/utils/format";

/**
 * Matrice de corrélation.
 *
 * Grille de cellules construite à la main plutôt qu'avec une bibliothèque de
 * graphiques : la matrice ne dépasse jamais quelques centaines de cellules, une
 * dépendance supplémentaire ne servirait qu'à ce seul écran, et le rendu
 * s'aligne ainsi exactement sur les jetons de thème du reste de l'application.
 *
 * L'échelle est divergente bleu → gris → rouge, avec un **gris** au point
 * neutre : c'est ce qui fait lire « aucune relation » au milieu de l'échelle.
 * Le vert et le rouge de performance sont écartés à dessein — une corrélation
 * élevée n'est ni bonne ni mauvaise en soi, elle dépend de ce que l'on cherche.
 *
 * La valeur est écrite dans chaque cellule : la couleur seule ne suffit ni pour
 * un lecteur daltonien, ni pour distinguer 0,62 de 0,71.
 */
export function CorrelationHeatmap({
  correlation,
}: {
  correlation: CorrelationMatrix;
}) {
  const { labels, matrix, observations } = correlation;
  const size = labels.length;

  /** Abrégé de colonne : les libellés complets prendraient toute la largeur. */
  const shortLabel = (label: string) => {
    const afterDash = label.split("—").pop()?.trim() ?? label;
    return afterDash.length > 8 ? `${afterDash.slice(0, 7)}…` : afterDash;
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card" />
              {labels.map((label) => (
                <th
                  key={label}
                  className="px-1 pb-1 text-center font-normal text-muted-foreground"
                  title={label}
                >
                  {shortLabel(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((rowLabel, i) => (
              <tr key={rowLabel}>
                <th
                  className="sticky left-0 max-w-[160px] truncate bg-card pr-2 text-right font-normal text-muted-foreground"
                  title={rowLabel}
                >
                  {rowLabel}
                </th>
                {labels.map((colLabel, j) => {
                  const value = matrix[i][j];
                  return (
                    <td key={colLabel} className="p-0">
                      <HoverCard openDelay={100}>
                        <HoverCardTrigger asChild>
                          <div
                            className="tnum flex h-9 min-w-[52px] cursor-help items-center justify-center rounded-sm text-[11px] font-medium"
                            style={{ backgroundColor: correlationColor(value) }}
                          >
                            {formatRatio(value)}
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72 space-y-1.5 text-sm">
                          <p className="font-medium">
                            {rowLabel} · {colLabel}
                          </p>
                          <p className="tnum text-lg">{formatRatio(value)}</p>
                          <p className="text-muted-foreground">
                            {describeCorrelation(value)}
                          </p>
                        </HoverCardContent>
                      </HoverCard>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScaleLegend />
        <p className="text-xs text-muted-foreground">
          Rendements mensuels · {observations} observations
        </p>
      </div>

      {size >= 2 && (
        <p className="text-xs text-muted-foreground">
          Deux actifs fortement corrélés montent et descendent ensemble : les
          détenir tous les deux diversifie peu. C&apos;est en combinant des
          actifs faiblement, voire négativement corrélés qu&apos;un portefeuille
          réduit sa volatilité sans nécessairement sacrifier son rendement.
        </p>
      )}
    </div>
  );
}

function describeCorrelation(value: number): string {
  const magnitude = Math.abs(value);

  if (magnitude >= 0.9) {
    return value > 0
      ? "Quasiment interchangeables : ils évoluent presque exactement de la même façon, la diversification apportée est nulle."
      : "Miroirs l'un de l'autre : quand l'un monte, l'autre descend dans la même proportion.";
  }
  if (magnitude >= 0.6) {
    return value > 0
      ? "Nettement liés : ils réagissent aux mêmes événements, avec une intensité proche."
      : "Nettement opposés : l'un amortit les baisses de l'autre.";
  }
  if (magnitude >= 0.3) {
    return value > 0
      ? "Modérément liés : une tendance commune existe, mais chacun garde sa trajectoire propre."
      : "Modérément opposés : ils se compensent partiellement.";
  }
  return "Peu ou pas de relation : leurs variations sont largement indépendantes, ce qui est favorable à la diversification.";
}

function ScaleLegend() {
  const stops = [-1, -0.5, 0, 0.5, 1];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">−1</span>
      <div className="flex">
        {stops.map((stop) => (
          <span
            key={stop}
            className="h-3 w-7 first:rounded-l-sm last:rounded-r-sm"
            style={{ backgroundColor: correlationColor(stop) }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">+1</span>
    </div>
  );
}
