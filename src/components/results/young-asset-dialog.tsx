"use client";

import { CalendarClock, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { YoungAssetResolution, YoungAssetWarning } from "@/lib/engine/types";
import { formatDate } from "@/lib/utils/format";

/**
 * Arbitrage sur les actifs plus jeunes que la période demandée.
 *
 * Le choix appartient à l'utilisateur parce qu'aucune des deux options n'est
 * neutre : raccourcir la période écarte peut-être la seule crise intéressante
 * du backtest, tandis que le proxy fabrique un historique qui n'a jamais
 * existé. Décider à sa place, dans un sens ou dans l'autre, produirait un
 * résultat dont il ne connaîtrait pas les hypothèses.
 */
export function YoungAssetDialog({
  open,
  youngAssets,
  requestedYears,
  effectiveStartDate,
  onResolve,
}: {
  open: boolean;
  youngAssets: YoungAssetWarning[];
  requestedYears: number;
  effectiveStartDate: string;
  onResolve: (resolution: YoungAssetResolution) => void;
}) {
  const anyProxy = youngAssets.some((asset) => asset.hasProxy);

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-[var(--score-3)]" />
            Historique plus court que la période demandée
          </DialogTitle>
          <DialogDescription>
            Vous avez demandé {requestedYears} ans, mais{" "}
            {youngAssets.length === 1
              ? "un actif de votre allocation ne cote pas"
              : "certains actifs de votre allocation ne cotent pas"}{" "}
            depuis aussi longtemps.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 rounded-md border p-3 text-sm">
          {youngAssets.map((asset) => (
            <li key={asset.assetId} className="flex items-center gap-2">
              <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{asset.label}</span>
              <span className="text-xs text-muted-foreground">
                depuis le {formatDate(asset.inceptionDate)}
              </span>
              {asset.hasProxy && (
                <span className="rounded border px-1.5 text-[11px] text-muted-foreground">
                  proxy
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border p-3">
            <p className="font-medium">Démarrer au {formatDate(effectiveStartDate)}</p>
            <p className="text-muted-foreground">
              Le backtest ne porte que sur la période réellement couverte par
              tous les actifs. Aucune donnée inventée, mais une période plus
              courte, qui peut exclure les crises passées.
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="font-medium">
              Compléter avec un indice de substitution
            </p>
            <p className="text-muted-foreground">
              {anyProxy
                ? "L'antériorité manquante est reconstituée à partir d'un indice plus ancien suivant le même marché, raccordé sur les variations. Les périodes reconstituées sont hachurées sur les graphiques."
                : "Aucun des actifs concernés ne dispose d'un indice de substitution au catalogue : cette option est indisponible."}
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          <Button onClick={() => onResolve("start-late")}>
            Démarrer plus tard
          </Button>
          <Button
            variant="outline"
            disabled={!anyProxy}
            onClick={() => onResolve("use-proxy")}
          >
            Utiliser un proxy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
