import { CreateShell } from "@/components/strategy-editor/create-shell";
import { requireUser } from "@/lib/auth/session";
import { listCatalogAssets } from "@/lib/db/queries/assets";

export const metadata = {
  title: "Nouvelle stratégie — Simulateur de portefeuille",
};

export default async function NewStrategyPage() {
  await requireUser();

  // Chargé côté serveur : l'éditeur affiche le catalogue et les allocations
  // types dès le premier rendu, sans état de chargement.
  const catalog = await listCatalogAssets();

  return <CreateShell catalog={catalog} />;
}
