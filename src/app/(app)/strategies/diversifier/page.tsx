import { DiversifyShell } from "@/components/diversify/diversify-shell";
import { requireUser } from "@/lib/auth/session";
import { listCatalogAssets } from "@/lib/db/queries/assets";

export const metadata = {
  title: "Diversifier un portefeuille — Simulateur de portefeuille",
};

export default async function DiversifyPage() {
  await requireUser();

  const catalog = await listCatalogAssets();

  return <DiversifyShell catalog={catalog} />;
}
