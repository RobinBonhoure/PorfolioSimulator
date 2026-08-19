import { redirect } from "next/navigation";

/**
 * L'écran de modification distinct n'existe plus : les paramètres se règlent
 * dans la colonne de gauche de la stratégie, au vu des résultats. La route est
 * conservée pour ne pas casser les liens et signets existants.
 */
export default async function EditStrategyRedirect({
  params,
}: PageProps<"/strategies/[id]/edit">) {
  const { id } = await params;
  redirect(`/strategies/${id}`);
}
