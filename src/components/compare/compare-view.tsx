"use client";

import { useQuery } from "@tanstack/react-query";
import { Columns3, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { BreakdownDonut } from "@/components/charts/breakdown-donut";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComparisonResult } from "@/lib/backtest/compare";
import { colorForIndex } from "@/lib/utils/asset-palette";
import { formatDate } from "@/lib/utils/format";
import { CompareDrawdownChart, CompareValueChart } from "./compare-charts";
import { CompareTable } from "./compare-table";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function CompareView({ strategyIds }: { strategyIds: string[] }) {
  const { data, isPending, error } = useQuery<ComparisonResult>({
    queryKey: ["compare", strategyIds],
    enabled: strategyIds.length >= 2,
    retry: false,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch("/api/compare/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyIds }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "La comparaison a échoué.");
      }
      return payload;
    },
  });

  // La couleur suit la position dans la comparaison, stable tant que la
  // sélection ne change pas — et l'URL la fige.
  const colors = useMemo(
    () => new Map(strategyIds.map((id, index) => [id, colorForIndex(index)])),
    [strategyIds],
  );

  if (strategyIds.length < 2) {
    return (
      <EmptyState
        icon={Columns3}
        title="Comparaison de stratégies"
        description="Sélectionnez deux à quatre stratégies depuis la liste pour les confronter sur une période commune."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/strategies">Voir mes stratégies</Link>
          </Button>
        }
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <TriangleAlert className="size-5 text-[var(--neg-text)]" />
        <p className="font-medium">La comparaison n&apos;a pas abouti</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/strategies">Revenir à mes stratégies</Link>
        </Button>
      </div>
    );
  }

  const seriesInfo = data.strategies.map((strategy) => ({
    id: strategy.id,
    name: strategy.name,
    color: colors.get(strategy.id) ?? colorForIndex(0),
  }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">
          Comparaison de {data.strategies.length} stratégies
        </h1>
        <p className="text-sm text-muted-foreground">
          Période commune du {formatDate(data.commonStart)} au{" "}
          {formatDate(data.commonEnd)}.
        </p>
      </header>

      {data.truncated.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--score-3)]" />
          <span>
            L&apos;historique de{" "}
            <span className="font-medium">{data.truncated.join(", ")}</span>{" "}
            remonte plus loin, mais la comparaison est tronquée à la période
            couverte par toutes les stratégies. Comparer des périodes
            différentes reviendrait à comparer des marchés différents.
          </span>
        </p>
      )}

      {data.warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-md border border-[var(--score-3)]/40 bg-[var(--score-3)]/10 p-3 text-sm"
        >
          {warning}
        </p>
      ))}

      <Section
        title="Évolution comparée"
        description="Toutes les stratégies ramenées à 100 au début de la période commune."
      >
        <CompareValueChart series={data.series} strategies={seriesInfo} />
      </Section>

      <Section
        title="Tableau comparatif"
        description="Survolez le nom d'une métrique pour sa définition."
      >
        <CompareTable strategies={data.strategies} colors={colors} />
      </Section>

      <Section
        title="Baisses subies"
        description="Écart au dernier sommet, superposé pour toutes les stratégies."
      >
        <CompareDrawdownChart
          drawdowns={data.drawdowns}
          strategies={seriesInfo}
        />
      </Section>

      <Section
        title="Répartitions"
        description="Décompositions des supports, pondérées par leurs poids cibles."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {data.strategies.map((strategy) => (
            <div key={strategy.id} className="space-y-4 rounded-md border p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: colors.get(strategy.id) }}
                />
                {strategy.name}
              </p>
              <BreakdownDonut
                title="Secteurs"
                slices={strategy.sectors}
                emptyLabel="Aucune décomposition sectorielle disponible."
              />
              <BreakdownDonut
                title="Zones géographiques"
                slices={strategy.geography}
                emptyLabel="Aucune décomposition géographique disponible."
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
