import { CompareView } from "@/components/compare/compare-view";
import { requireUser } from "@/lib/auth/session";
import { listAssetsByIds, listCatalogAssets } from "@/lib/db/queries/assets";
import { getLastComparison } from "@/lib/db/queries/comparisons";
import { listStrategiesForUser } from "@/lib/db/queries/strategies";

export const metadata = { title: "Comparer — Simulateur de portefeuille" };

export default async function ComparePage({
  searchParams,
}: PageProps<"/compare">) {
  const user = await requireUser();

  const { ids, assets } = await searchParams;

  // La sélection vit dans l'URL : la comparaison reste ainsi partageable par
  // simple copie du lien, sans entité persistée en base. La propriété des
  // stratégies est revérifiée côté serveur au moment du calcul.
  //
  // `ids` reste le paramètre des stratégies pour ne pas invalider les liens
  // déjà partagés ; `assets` est venu s'y ajouter.
  const parseIds = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value.join(",") : (value ?? ""))
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

  const strategyIds = parseIds(ids).slice(0, 4);
  const assetIds = parseIds(assets).slice(0, 4);

  // Sans rien dans l'URL, on reprend la dernière comparaison consultée plutôt
  // que d'accueillir l'utilisateur sur un écran vide. Une adresse explicite
  // l'emporte toujours : c'est elle qu'on a partagée ou mise en signet.
  const fromUrl = strategyIds.length + assetIds.length > 0;
  const saved = await getLastComparison(user.id);
  const remembered = fromUrl ? null : saved;
  const lastParams = saved.params;

  // Chargées d'emblée : sans sélection dans l'URL, l'écran doit permettre de la
  // constituer sur place. Renvoyer vers « Mes stratégies » faisait de cette page
  // un cul-de-sac, alors qu'elle est la destination annoncée par la navigation.
  const initialSelection = remembered
    ? { strategyIds: remembered.strategyIds, assetIds: remembered.assetIds }
    : { strategyIds, assetIds };

  const [strategies, catalog, chosenAssets] = await Promise.all([
    listStrategiesForUser(user.id),
    listCatalogAssets(),
    // Résolus séparément : un support ajouté depuis Yahoo n'est pas au
    // catalogue, et la colonne de gauche l'afficherait sans nom.
    listAssetsByIds(initialSelection.assetIds),
  ]);

  return (
    <CompareView
      initial={initialSelection}
      // Le plan retenu la dernière fois est restauré même quand l'URL impose
      // une autre sélection : c'est un réglage d'affichage, pas une propriété
      // de la comparaison partagée.
      initialParams={lastParams}
      strategies={strategies}
      catalog={catalog}
      chosenAssets={chosenAssets}
    />
  );
}
