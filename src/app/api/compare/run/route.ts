import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { compareStrategies } from "@/lib/backtest/compare";
import { YahooDataError } from "@/lib/data-fetching/yahoo/client";
import { MissingFxDataError } from "@/lib/engine/fx";
import { BacktestError } from "@/lib/engine/run-backtest";

/** Jusqu'à quatre stratégies calculées de suite : même marge que le backtest simple. */
export const maxDuration = 60;

const bodySchema = z.object({
  strategyIds: z.array(z.uuid()).min(2).max(4),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Sélectionnez deux à quatre stratégies." },
      { status: 400 },
    );
  }

  try {
    const result = await compareStrategies(
      parsed.data.strategyIds,
      session.user.id,
    );
    return NextResponse.json(result);
  } catch (error) {
    // Seules ces trois familles portent un message rédigé pour l'utilisateur.
    // Toute autre erreur reste dans les journaux : relayer son message
    // exposerait des détails d'implémentation sans aider qui que ce soit.
    if (
      error instanceof BacktestError ||
      error instanceof YahooDataError ||
      error instanceof MissingFxDataError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("Échec de la comparaison", error);
    return NextResponse.json(
      { error: "La comparaison a échoué pour une raison inattendue." },
      { status: 500 },
    );
  }
}
