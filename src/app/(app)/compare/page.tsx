import { CompareView } from "@/components/compare/compare-view";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Comparer — Simulateur de portefeuille" };

export default async function ComparePage({
  searchParams,
}: PageProps<"/compare">) {
  await requireUser();

  const { ids } = await searchParams;
  const raw = Array.isArray(ids) ? ids.join(",") : (ids ?? "");

  // La sélection vit dans l'URL : la comparaison reste ainsi partageable par
  // simple copie du lien, sans entité persistée en base. La propriété des
  // stratégies est revérifiée côté serveur au moment du calcul.
  const strategyIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <CompareView strategyIds={strategyIds} />
      </div>
    </div>
  );
}
