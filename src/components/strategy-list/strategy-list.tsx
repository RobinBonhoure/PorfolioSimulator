"use client";

import { Columns3, LineChart, Plus, Sparkles } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import type { StrategyListItem } from "@/lib/db/queries/strategies";
import { StrategyCard } from "./strategy-card";

/**
 * Liste des stratégies.
 *
 * Une carte est un lien, et rien d'autre : un clic l'ouvre. La sélection en vue
 * d'une comparaison vivait ici, sous forme de cases à cocher posées sous le
 * calque cliquable du lien — donc littéralement impossibles à cocher. Elle a
 * rejoint l'écran de comparaison, qui sait désormais choisir lui-même et
 * accepte en prime des supports du catalogue.
 */
export function StrategyList({
  strategies,
}: {
  strategies: StrategyListItem[];
}) {
  if (strategies.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="Rien à comparer pour l'instant"
        description="Composez une allocation d'actifs, lancez un backtest sur données historiques réelles, et gardez la stratégie pour la confronter aux suivantes."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/strategies/guide">
                <Sparkles className="size-4" />
                Être guidé pas à pas
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/strategies/new">Composer moi-même</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {strategies.map((strategy) => (
          <li key={strategy.id}>
            <StrategyCard strategy={strategy} />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Deux chemins de création, côte à côte.
 *
 * Le parcours guidé traduit un projet en allocation ; la composition directe
 * suppose qu'on sait déjà ce qu'on veut. Les deux publics existent, et imposer
 * six questions à qui veut seulement tester 100 % MSCI World serait une friction
 * gratuite. Le guidé est mis en avant parce que c'est celui qui débloque
 * quelqu'un qui ne sait pas par où commencer.
 */
export function NewStrategyButton({
  canCompare = false,
}: {
  /** Le bouton de comparaison rejoint le groupe plutôt que de flotter seul sur
   *  sa propre ligne. Il n'apparaît qu'à partir de deux stratégies : c'est le
   *  minimum que la comparaison accepte. */
  canCompare?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canCompare && (
        <Button asChild size="sm" variant="outline">
          <Link href="/compare">
            <Columns3 className="size-4" />
            Comparer
          </Link>
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <Link href="/strategies/new">
          <Plus className="size-4" />
          Composer moi-même
        </Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/strategies/guide">
          <Sparkles className="size-4" />
          Être guidé
        </Link>
      </Button>
    </div>
  );
}
