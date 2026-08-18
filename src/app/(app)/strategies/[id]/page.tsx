import { notFound } from "next/navigation";

import { ResultsView } from "@/components/results/results-view";
import { requireUser } from "@/lib/auth/session";
import { getStrategyForUser } from "@/lib/db/queries/strategies";

export default async function StrategyResultsPage({
  params,
}: PageProps<"/strategies/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  // `getStrategyForUser` filtre déjà sur l'utilisateur : une stratégie
  // appartenant à quelqu'un d'autre ressort comme inexistante, sans que la
  // réponse ne permette de distinguer les deux cas.
  const strategy = await getStrategyForUser(id, user.id);
  if (!strategy) notFound();

  return <ResultsView strategyId={id} />;
}

export async function generateMetadata({
  params,
}: PageProps<"/strategies/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const strategy = await getStrategyForUser(id, user.id);

  return {
    title: strategy
      ? `${strategy.name} — Simulateur de portefeuille`
      : "Stratégie introuvable",
  };
}
