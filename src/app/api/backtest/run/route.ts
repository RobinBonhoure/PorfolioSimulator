import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { runBacktestForStrategy } from "@/lib/backtest/run-for-strategy";
import { YahooDataError } from "@/lib/data-fetching/yahoo/client";
import { BacktestError } from "@/lib/engine/run-backtest";
import { MissingFxDataError } from "@/lib/engine/fx";
import { backtestRequestSchema } from "@/lib/validation/backtest.schema";

/**
 * Le premier backtest d'une stratégie télécharge l'historique complet de chacun
 * de ses actifs. Mesuré à environ une seconde par actif, l'opération reste très
 * en deçà de la limite d'exécution, mais dépasse largement le délai par défaut :
 * on relève donc explicitement le plafond. Les exécutions suivantes lisent le
 * cache et se comptent en dizaines de millisecondes.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const parsed = backtestRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Requête invalide." },
      { status: 400 },
    );
  }

  try {
    const response = await runBacktestForStrategy({
      strategyId: parsed.data.strategyId,
      userId: session.user.id,
      youngAssetResolution: parsed.data.youngAssetResolution ?? undefined,
      draft: parsed.data.draft ?? null,
    });

    return NextResponse.json(response);
  } catch (error) {
    // Ces trois familles d'erreurs portent un message rédigé pour
    // l'utilisateur : période vide, actif délisté, change indisponible. Les
    // relayer telles quelles vaut mieux qu'un « erreur interne » générique.
    if (
      error instanceof BacktestError ||
      error instanceof YahooDataError ||
      error instanceof MissingFxDataError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("Échec du backtest", error);
    return NextResponse.json(
      { error: "Le calcul a échoué pour une raison inattendue." },
      { status: 500 },
    );
  }
}
