"use client";

import { Loader2, MoreVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteStrategy, duplicateStrategy } from "@/actions/strategies";
import { PeaBadge } from "@/components/strategy-editor/pea-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StrategyListItem } from "@/lib/db/queries/strategies";
import { formatPercent, formatRatio } from "@/lib/utils/format";

/**
 * Carte de stratégie.
 *
 * Les trois chiffres retenus — rendement, pire baisse et Sharpe — forment le
 * minimum permettant de comparer deux stratégies sans les ouvrir : ce qu'elle
 * rapporte, ce qu'elle fait subir, et si le second justifie le premier.
 *
 * Une stratégie jamais lancée affiche l'absence de résultat plutôt que des
 * tirets muets : c'est une invitation à la lancer, pas une donnée manquante.
 */
export function StrategyCard({
  strategy,
  selected,
  onSelectedChange,
  selectionDisabled,
}: {
  strategy: StrategyListItem;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  selectionDisabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const metrics = strategy.metrics;

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          disabled={selectionDisabled && !selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={`Sélectionner ${strategy.name} pour la comparaison`}
          className="mt-0.5"
        />

        <Link
          href={`/strategies/${strategy.id}`}
          className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']"
        >
          <p className="truncate font-medium">{strategy.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {strategy.assetCount} actif{strategy.assetCount > 1 ? "s" : ""}
            {strategy.description ? ` · ${strategy.description}` : ""}
          </p>
        </Link>

        <PeaBadge eligible={strategy.peaEligible ? true : false} />

        {/* Au-dessus du lien couvrant, sinon le clic ouvrirait la stratégie. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 size-7 shrink-0"
              aria-label={`Actions sur ${strategy.name}`}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MoreVertical className="size-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/strategies/${strategy.id}`}>Ouvrir</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await duplicateStrategy(strategy.id);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  router.push(`/strategies/${result.data.id}`);
                })
              }
            >
              Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                startTransition(async () => {
                  const result = await deleteStrategy(strategy.id);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(`« ${strategy.name} » supprimée.`);
                  router.refresh();
                })
              }
            >
              <Trash2 className="size-3.5" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {metrics ? (
        <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Rendement</dt>
            <dd className="tnum font-medium">{formatPercent(metrics.cagr)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pire baisse</dt>
            <dd className="tnum font-medium text-[var(--neg-text)]">
              {formatPercent(metrics.drawdown.maxDrawdown)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sharpe</dt>
            <dd className="tnum font-medium">{formatRatio(metrics.sharpe)}</dd>
          </div>
        </dl>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Jamais lancée — ouvrez-la pour calculer son backtest.
        </p>
      )}
    </div>
  );
}
