"use client";

import { PeaBadge } from "@/components/strategy-editor/pea-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResultAssetInfo } from "@/lib/backtest/run-for-strategy";
import type { AssetPerformance } from "@/lib/engine/types";
import { buildAssetPalette } from "@/lib/utils/asset-palette";
import {
  formatEur,
  formatPercent,
  formatSignedEur,
  formatSignedPercent,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/**
 * Ce que chaque ligne a réellement rapporté.
 *
 * Deux notions de performance cohabitent volontairement, parce qu'elles
 * répondent à deux questions différentes et qu'on les confond facilement :
 *
 * - **Performance du support** : ce qu'a fait l'ETF ou l'action sur la période,
 *   indépendamment des sommes engagées. C'est le chiffre qu'on lit dans une
 *   fiche produit.
 * - **Plus ou moins-value** : ce que la ligne a apporté au portefeuille, en
 *   euros. Elle dépend du montant investi et surtout de sa date : un support
 *   qui double après n'avoir reçu que les derniers versements rapporte peu.
 *
 * Un support peut ainsi afficher la meilleure performance et la plus faible
 * contribution. La ligne de total est là pour le prouver : elle retombe
 * exactement sur les chiffres du bandeau, faute de quoi le tableau ne mériterait
 * aucune confiance.
 */
export function AssetBreakdown({
  performance,
  assets,
  realMode,
}: {
  performance: AssetPerformance[];
  assets: ResultAssetInfo[];
  realMode: boolean;
}) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const palette = buildAssetPalette(assets.map((asset) => asset.id));

  const rows = [...performance].sort((a, b) => b.gain - a.gain);
  const totals = rows.reduce(
    (acc, row) => ({
      contributed: acc.contributed + row.contributed,
      finalValue: acc.finalValue + row.finalValue,
      gain: acc.gain + row.gain,
    }),
    { contributed: 0, finalValue: 0, gain: 0 },
  );

  // Le rééquilibrage déplace de l'argent d'une ligne à l'autre : quand c'est le
  // cas, la plus ou moins-value d'une ligne cesse d'être sa valeur moins son
  // versement, et il faut le dire. Sans rééquilibrage, la soustraction tombe
  // juste et la note n'a pas lieu d'être.
  const rebalancingMovedMoney = rows.some(
    (row) => Math.abs(row.rebalancingFlow) >= 1,
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Support</TableHead>
              <TableHead className="text-right">Poids</TableHead>
              <TableHead className="text-right">Performance</TableHead>
              <TableHead className="text-right">Annualisé</TableHead>
              <TableHead className="text-right">Versé</TableHead>
              <TableHead className="text-right">Valeur</TableHead>
              <TableHead className="text-right">+/− value</TableHead>
              <TableHead className="text-right">Part du gain</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => {
              const asset = byId.get(row.assetId);
              const drifted =
                Math.abs(row.finalWeight - row.targetWeight) >= 0.02;

              return (
                <TableRow key={row.assetId}>
                  <TableCell className="max-w-[220px]">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: palette.get(row.assetId) }}
                      />
                      <span className="truncate">
                        {asset?.label ?? row.assetId}
                      </span>
                      {asset && <PeaBadge eligible={asset.peaEligible} />}
                    </span>
                  </TableCell>

                  <TableCell className="tnum text-right">
                    {formatPercent(row.finalWeight, 1)}
                    {/* L'écart au poids cible se lit ici et nulle part ailleurs :
                        c'est la dérive que le rééquilibrage est censé corriger. */}
                    <span
                      className={cn(
                        "block text-[10px]",
                        drifted
                          ? "text-[var(--score-3)]"
                          : "text-muted-foreground",
                      )}
                    >
                      cible {formatPercent(row.targetWeight, 0)}
                    </span>
                  </TableCell>

                  <TableCell
                    className={cn(
                      "tnum text-right",
                      row.assetReturn >= 0
                        ? "text-[var(--pos-text)]"
                        : "text-[var(--neg-text)]",
                    )}
                  >
                    {formatSignedPercent(row.assetReturn, 1)}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "tnum text-right",
                      row.assetAnnualReturn >= 0
                        ? "text-[var(--pos-text)]"
                        : "text-[var(--neg-text)]",
                    )}
                  >
                    {formatSignedPercent(row.assetAnnualReturn, 2)}
                  </TableCell>

                  <TableCell className="tnum text-right">
                    {formatEur(row.contributed)}
                  </TableCell>
                  <TableCell className="tnum text-right">
                    {formatEur(row.finalValue)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tnum text-right font-medium",
                      row.gain >= 0
                        ? "text-[var(--pos-text)]"
                        : "text-[var(--neg-text)]",
                    )}
                  >
                    {formatSignedEur(row.gain)}
                  </TableCell>
                  <TableCell className="tnum text-right text-muted-foreground">
                    {row.gainShare === null
                      ? "—"
                      : formatPercent(row.gainShare, 0)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="tnum text-right">100 %</TableCell>
              <TableCell className="text-right text-muted-foreground">—</TableCell>
              <TableCell className="text-right text-muted-foreground">—</TableCell>
              <TableCell className="tnum text-right font-medium">
                {formatEur(totals.contributed)}
              </TableCell>
              <TableCell className="tnum text-right font-medium">
                {formatEur(totals.finalValue)}
              </TableCell>
              <TableCell
                className={cn(
                  "tnum text-right font-medium",
                  totals.gain >= 0
                    ? "text-[var(--pos-text)]"
                    : "text-[var(--neg-text)]",
                )}
              >
                {formatSignedEur(totals.gain)}
              </TableCell>
              <TableCell className="tnum text-right text-muted-foreground">
                100 %
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <ul className="space-y-1 text-[11px] text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Performance</span> et{" "}
          <span className="font-medium text-foreground">annualisé</span> : ce
          qu&apos;a fait le support lui-même, sur toute la période puis au rythme
          annuel.{" "}
          <span className="font-medium text-foreground">+/− value</span> : ce que
          la ligne a apporté au portefeuille, montants et dates de versement
          compris. Les deux ne classent pas les supports dans le même ordre.
          {realMode && " Tous les montants sont en euros constants."}
        </li>
        {rebalancingMovedMoney && (
          <li>
            Les rééquilibrages déplacent de l&apos;argent d&apos;une ligne à
            l&apos;autre : la plus ou moins-value d&apos;une ligne n&apos;est donc
            pas sa valeur moins son versement. Les trois totaux, eux, retombent
            bien sur ceux du bandeau.
          </li>
        )}
      </ul>
    </div>
  );
}
