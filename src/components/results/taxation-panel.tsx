import { TriangleAlert } from "lucide-react";

import type { TaxationResult } from "@/lib/engine/types";
import { formatEur } from "@/lib/utils/format";

/**
 * Comparaison des deux enveloppes à la sortie.
 *
 * Les hypothèses sont affichées avec les montants, et non renvoyées à une note
 * de bas de page : un chiffre net d'impôt paraît définitif alors qu'il repose
 * entièrement sur une hypothèse de sortie totale au terme, et sur une détention
 * du PEA d'au moins cinq ans.
 */
export function TaxationPanel({
  taxation,
  years,
}: {
  taxation: TaxationResult;
  years: number;
}) {
  const peaShortOfFiveYears = years < 5;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-lg border p-3 ${
            taxation.peaEligible ? "border-[var(--pos)]/40" : ""
          }`}
        >
          <p className="text-xs text-muted-foreground">
            PEA — prélèvements sociaux 17,2 %
          </p>
          <p className="tnum text-xl font-semibold">
            {taxation.peaEligible ? formatEur(taxation.netValuePea) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {taxation.peaEligible
              ? peaShortOfFiveYears
                ? "Durée inférieure à cinq ans : le retrait clôturerait le plan, le forfait unique s'appliquerait donc."
                : "Après cinq ans de détention, les gains échappent à l'impôt sur le revenu."
              : "Enveloppe indisponible pour cette allocation."}
          </p>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            Compte-titres — forfait unique 30 %
          </p>
          <p className="tnum text-xl font-semibold">
            {formatEur(taxation.netValueCto)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            12,8 % d&apos;impôt sur le revenu et 17,2 % de prélèvements sociaux.
          </p>
        </div>
      </div>

      {!taxation.peaEligible && (
        <p className="flex items-start gap-2 rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--score-3)]" />
          <span>
            Cette stratégie n&apos;est pas logeable en PEA à cause de :{" "}
            <span className="font-medium">
              {taxation.peaBlockingAssets.join(", ")}
            </span>
            .
          </span>
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Plus-value imposable retenue : {formatEur(taxation.capitalGain)}, en
        supposant une sortie totale au dernier jour de la période. Les
        dividendes sont traités comme réinvestis, les cours utilisés étant
        ajustés.
      </p>
    </div>
  );
}
