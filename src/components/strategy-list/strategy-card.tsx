"use client";

import { Loader2, MoreVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteStrategy, duplicateStrategy } from "@/actions/strategies";
import { PeaBadge } from "@/components/strategy-editor/pea-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StrategyListItem } from "@/lib/db/queries/strategies";
import { HoldingsBar } from "./holdings-bar";
import { formatPercent, formatSignedPercent } from "@/lib/utils/format";

/**
 * Carte de stratégie.
 *
 * Deux chiffres seulement — ce qu'elle rapporte et ce qu'elle fait subir :
 * le minimum pour comparer deux stratégies sans les ouvrir, dans le même
 * vocabulaire que la page de la stratégie.
 *
 * Une stratégie jamais lancée affiche l'absence de résultat plutôt que des
 * tirets muets : c'est une invitation à la lancer, pas une donnée manquante.
 */
export function StrategyCard({ strategy }: { strategy: StrategyListItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const metrics = strategy.metrics;

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-2">
        {/* Le calque du lien couvre toute la carte pour en faire une cible
            unique. Tout contrôle qui doit rester cliquable passe donc au-dessus
            avec `relative z-10` : c'est ce qui manquait à l'ancienne case à
            cocher de comparaison, qui se retrouvait dessous. */}
        <Link
          href={`/strategies/${strategy.id}`}
          className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']"
        >
          <p className="font-heading truncate font-bold">{strategy.name}</p>
          {strategy.description && (
            <p className="truncate text-xs text-muted-foreground">
              {strategy.description}
            </p>
          )}
        </Link>

        <PeaBadge eligible={strategy.peaEligible ? true : false} />

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

      <HoldingsBar holdings={strategy.holdings} />

      {metrics ? (
        // Les deux chiffres qui comptent, en pilules : ce que ça rapporte et ce
        // que ça fait subir. Le Sharpe a rejoint les détails d'expert de la
        // page — sur une carte, il n'aidait que ceux qui n'en ont pas besoin.
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span
            className={`tnum rounded-full px-2.5 py-1 text-xs font-bold ${
              metrics.cagr >= 0
                ? "bg-[var(--pos)]/12 text-[var(--pos-text)]"
                : "bg-[var(--neg)]/12 text-[var(--neg-text)]"
            }`}
          >
            {formatSignedPercent(metrics.cagr, 1)} par an
          </span>
          <span className="tnum rounded-full bg-[var(--neg)]/12 px-2.5 py-1 text-xs font-bold text-[var(--neg-text)]">
            {formatPercent(metrics.drawdown.maxDrawdown, 0)} au pire
          </span>
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Jamais lancée — ouvrez-la pour calculer son backtest.
        </p>
      )}
    </div>
  );
}
