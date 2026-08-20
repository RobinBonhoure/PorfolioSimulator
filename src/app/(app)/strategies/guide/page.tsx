import { GuideShell } from "@/components/wizard/guide-shell";
import { requireUser } from "@/lib/auth/session";
import { listCatalogAssets } from "@/lib/db/queries/assets";

export const metadata = {
  title: "Construire un portefeuille — Simulateur de portefeuille",
};

export default async function GuidePage() {
  await requireUser();

  const catalog = await listCatalogAssets();

  return <GuideShell catalog={catalog} />;
}
