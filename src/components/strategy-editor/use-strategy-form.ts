"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { addFallbackAsset } from "@/actions/assets";
import { buildAssetPalette } from "@/lib/utils/asset-palette";
import {
  DEFAULT_STRATEGY_FORM,
  type StrategyFormValues,
} from "@/lib/validation/strategy.schema";
import { equalWeights, totalWeight, type EditorAsset } from "./types";

/**
 * État partagé par les deux écrans qui composent une allocation.
 *
 * La page de création et l'espace de travail présentent la même chose dans deux
 * mises en page différentes ; sans cet état commun, chaque règle — première
 * ligne à 100 %, refus des doublons, répartition égale — existerait en deux
 * exemplaires voués à diverger.
 */
export function useStrategyForm(
  initialValues?: StrategyFormValues,
  initialAssets?: EditorAsset[],
) {
  const [values, setValues] = useState<StrategyFormValues>(
    initialValues ?? DEFAULT_STRATEGY_FORM,
  );
  const [assets, setAssets] = useState<EditorAsset[]>(initialAssets ?? []);

  const palette = useMemo(
    () => buildAssetPalette(assets.map((a) => a.assetId)),
    [assets],
  );

  const total = totalWeight(assets);
  const weightsValid = Math.abs(total - 100) < 0.01;
  const hasContribution =
    values.initialAmount > 0 || values.monthlyContribution > 0;
  const complete =
    weightsValid &&
    assets.length > 0 &&
    hasContribution &&
    values.name.trim().length > 0;

  function patch(update: Partial<StrategyFormValues>) {
    setValues((current) => ({ ...current, ...update }));
  }

  function addAsset(asset: EditorAsset) {
    setAssets((current) => {
      if (current.some((a) => a.assetId === asset.assetId)) return current;

      // Premier actif ajouté : lui donner 100 % évite un formulaire invalide
      // dès la première action. Au-delà, on répartit également, ce qui est le
      // point de départ le plus courant et reste modifiable.
      return equalWeights([...current, asset]);
    });
  }

  async function addFromYahoo(symbol: string, name: string) {
    const result = await addFallbackAsset({ symbol, name });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    addAsset({
      assetId: result.data.assetId,
      tickerYahoo: symbol,
      shortLabel: name.length > 40 ? `${name.slice(0, 38)}…` : name,
      type: "stock",
      peaEligible: null,
      ter: null,
      currency: "EUR",
      dataPartial: true,
      weightPercent: 0,
    });
  }

  function setWeight(assetId: string, weightPercent: number) {
    setAssets((current) =>
      current.map((a) => (a.assetId === assetId ? { ...a, weightPercent } : a)),
    );
  }

  function removeAsset(assetId: string) {
    setAssets((current) => current.filter((a) => a.assetId !== assetId));
  }

  function equalize() {
    setAssets((current) => equalWeights(current));
  }

  /** Valeurs du formulaire complétées par les poids courants. */
  function toPayload(): StrategyFormValues {
    return {
      ...values,
      assets: assets.map((asset) => ({
        assetId: asset.assetId,
        weightPercent: asset.weightPercent,
      })),
    };
  }

  return {
    values,
    assets,
    palette,
    total,
    weightsValid,
    hasContribution,
    complete,
    patch,
    setValues,
    setAssets,
    addAsset,
    addFromYahoo,
    setWeight,
    removeAsset,
    equalize,
    toPayload,
  };
}

export type StrategyForm = ReturnType<typeof useStrategyForm>;
