import { createHash } from "node:crypto";

import { ENGINE_VERSION, type StrategyParams } from "@/lib/engine/types";
import type { StrategyAssetSelection } from "./prepare-input";

/**
 * Empreinte identifiant un calcul de backtest.
 *
 * Trois choses la composent, et l'oubli de n'importe laquelle ferait servir un
 * résultat périmé :
 *
 * - les paramètres de la stratégie ;
 * - la composition et les poids, sérialisés dans un ordre stable pour que
 *   réordonner les lignes ne produise pas une empreinte différente à
 *   allocation identique ;
 * - `ENGINE_VERSION`, sans quoi une correction du moteur laisserait
 *   indéfiniment en cache les résultats calculés par la version fautive.
 *
 * La date des données les plus récentes n'y figure pas : elle est stockée dans
 * une colonne distincte, ce qui permet de retrouver un résultat par
 * `(stratégie, empreinte, date)` et de le recalculer dès qu'une cotation
 * nouvelle apparaît.
 */
export function computeParamsHash(
  params: StrategyParams,
  selection: readonly StrategyAssetSelection[],
): string {
  const normalizedSelection = [...selection]
    .sort((a, b) => a.assetId.localeCompare(b.assetId))
    .map((asset) => `${asset.assetId}:${asset.targetWeight.toFixed(8)}`);

  const payload = JSON.stringify({
    engineVersion: ENGINE_VERSION,
    params,
    selection: normalizedSelection,
  });

  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}
