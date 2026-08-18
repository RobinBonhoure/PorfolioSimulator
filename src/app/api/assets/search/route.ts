import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { YahooDataError } from "@/lib/data-fetching/yahoo/client";
import { searchYahoo } from "@/lib/data-fetching/yahoo/search";
import { searchAssets } from "@/lib/db/queries/assets";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  /** Étend la recherche à Yahoo quand le catalogue ne renvoie rien. */
  fallback: z.enum(["0", "1"]).optional(),
});

export async function GET(request: Request) {
  // La recherche interroge une API tierce à nos frais : réservée aux comptes
  // authentifiés, comme le reste de l'application.
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    fallback: url.searchParams.get("fallback") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ catalog: [], yahoo: [] });
  }

  const catalog = await searchAssets(parsed.data.q);

  // Le repli sur Yahoo n'est déclenché qu'à la demande explicite du client,
  // et seulement si le catalogue est muet : c'est un appel réseau, il ne doit
  // pas se produire à chaque frappe.
  if (catalog.length > 0 || parsed.data.fallback !== "1") {
    return NextResponse.json({ catalog, yahoo: [] });
  }

  try {
    const yahoo = await searchYahoo(parsed.data.q);
    return NextResponse.json({ catalog, yahoo });
  } catch (error) {
    const message =
      error instanceof YahooDataError
        ? error.message
        : "La recherche étendue est momentanément indisponible.";
    return NextResponse.json({ catalog, yahoo: [], error: message });
  }
}
