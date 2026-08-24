import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { compareItems } from "@/lib/backtest/compare";
import { YahooDataError } from "@/lib/data-fetching/yahoo/client";
import { MissingFxDataError } from "@/lib/engine/fx";
import { engineParamsSchema } from "@/lib/validation/backtest.schema";
import { BacktestError } from "@/lib/engine/run-backtest";

/** Jusqu'à quatre éléments calculés de suite : même marge que le backtest simple. */
export const maxDuration = 60;

const bodySchema = z
  .object({
    strategyIds: z.array(z.uuid()).max(4).default([]),
    assetIds: z.array(z.uuid()).max(4).default([]),
    // Revalidé intégralement : ces paramètres viennent du navigateur et
    // atteignent le moteur sans passer par la base.
    params: engineParamsSchema,
  })
  // Le plafond porte sur le total, pas sur chaque famille : deux stratégies et
  // trois supports feraient cinq courbes superposées, illisibles.
  .refine((body) => {
    const total = body.strategyIds.length + body.assetIds.length;
    return total >= 2 && total <= 4;
  }, "Choisissez deux à quatre éléments à comparer.");

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
    const result = await compareItems(
      {
        strategyIds: parsed.data.strategyIds,
        assetIds: parsed.data.assetIds,
        params: parsed.data.params,
      },
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
