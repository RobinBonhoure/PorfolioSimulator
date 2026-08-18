"use client";

import { Columns3, LineChart, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import type { StrategyListItem } from "@/lib/db/queries/strategies";
import { StrategyCard } from "./strategy-card";

/** Bornes imposées par la lisibilité du tableau et du graphique superposé. */
const MIN_COMPARE = 2;
const MAX_COMPARE = 4;

export function StrategyList({
  strategies,
}: {
  strategies: StrategyListItem[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  const canCompare = selected.length >= MIN_COMPARE;
  const selectionFull = selected.length >= MAX_COMPARE;

  function toggle(id: string, isSelected: boolean) {
    setSelected((current) =>
      isSelected
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((existing) => existing !== id),
    );
  }

  if (strategies.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="Rien à comparer pour l'instant"
        description="Composez une allocation d'actifs, lancez un backtest sur données historiques réelles, et gardez la stratégie pour la confronter aux suivantes."
        action={
          <Button asChild size="sm">
            <Link href="/strategies/new">Créer ma première stratégie</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {strategies.map((strategy) => (
          <li key={strategy.id}>
            <StrategyCard
              strategy={strategy}
              selected={selected.includes(strategy.id)}
              onSelectedChange={(value) => toggle(strategy.id, value)}
              selectionDisabled={selectionFull}
            />
          </li>
        ))}
      </ul>

      {/* Barre d'action flottante : la sélection se fait en parcourant la
          liste, l'action doit rester atteignable sans remonter en haut. */}
      {selected.length > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full border bg-popover px-4 py-2 shadow-lg">
          <span className="text-sm">
            {selected.length} sélectionnée{selected.length > 1 ? "s" : ""}
            {selectionFull && " (maximum)"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={!canCompare}
            onClick={() =>
              router.push(`/compare?ids=${selected.join(",")}`)
            }
          >
            <Columns3 className="size-3.5" />
            Comparer ({selected.length})
          </Button>
        </div>
      )}

      {selected.length === 1 && (
        <p className="text-center text-xs text-muted-foreground">
          Sélectionnez au moins une seconde stratégie pour lancer la comparaison.
        </p>
      )}
    </>
  );
}

export function NewStrategyButton() {
  return (
    <Button asChild size="sm">
      <Link href="/strategies/new">
        <Plus className="size-4" />
        Nouvelle stratégie
      </Link>
    </Button>
  );
}
