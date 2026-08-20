import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { runBacktestPreview } from "@/lib/backtest/run-preview";
import { YahooDataError } from "@/lib/data-fetching/yahoo/client";
import { MissingFxDataError } from "@/lib/engine/fx";
import { BacktestError } from "@/lib/engine/run-backtest";
import { backtestDraftSchema } from "@/lib/validation/backtest.schema";

/** Comme la route principale : le premier calcul peut télécharger plusieurs
 *  historiques complets. */
export const maxDuration = 60;

/**
 * Backtest d'une allocation non enregistrée, pour le parcours guidé.
 *
 * Le corps de requête est exactement celui d'un brouillon, mais sans
 * `strategyId` : il n'y a pas encore de stratégie. La session reste exigée —
 * le calcul déclenche des appels sortants vers Yahoo, et une route ouverte en
 * ferait un relais gratuit.
 */
const bodySchema = z.object({ draft: backtestDraftSchema });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Requête invalide." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await runBacktestPreview({
        params: parsed.data.draft.params,
        selection: parsed.data.draft.selection,
      }),
    );
  } catch (error) {
    if (
      error instanceof BacktestError ||
      error instanceof YahooDataError ||
      error instanceof MissingFxDataError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("Échec du backtest de prévisualisation", error);
    return NextResponse.json(
      { error: "Le calcul a échoué pour une raison inattendue." },
      { status: 500 },
    );
  }
}
