import type { ComparedItem } from "@/lib/backtest/compare";
import type { BacktestMetrics } from "@/lib/engine/types";
import {
  formatEur,
  formatPercent,
  formatRatio,
  formatSignedPercent,
} from "@/lib/utils/format";

/**
 * Classement des éléments comparés.
 *
 * Ordonné sur la **valeur finale**, et c'est le plan commun qui rend ce choix
 * possible : depuis que tout le monde part du même capital avec le même
 * échéancier de versements, ces montants répondent littéralement à la question
 * qu'on se pose — combien j'aurais aujourd'hui. Un classement au rendement
 * annualisé dirait la même chose dans un vocabulaire plus abstrait ; un
 * classement sur un score composite obligerait à inventer des pondérations que
 * rien ne justifie.
 *
 * Chaque ligne porte de quoi comprendre son rang, parce qu'un rang sans raison
 * n'aide pas à décider : le rendement annualisé et la pire baisse traversée.
 * C'est presque toujours là qu'est l'arbitrage réel — le premier du classement
 * est fréquemment celui qui a fait le plus peur.
 *
 * D'où le second bloc : les autres critères ont leurs propres gagnants, et les
 * taire laisserait croire qu'un seul élément l'emporte sur tout.
 */

/** Meilleur élément sur un critère, ou `null` si tous sont à égalité. */
function leaderOn(
  items: ComparedItem[],
  value: (metrics: BacktestMetrics) => number | null,
  higherIsBetter: boolean,
): { item: ComparedItem; value: number } | null {
  const scored = items
    .map((item) => ({ item, value: value(item.metrics) }))
    .filter((entry): entry is { item: ComparedItem; value: number } =>
      entry.value !== null && Number.isFinite(entry.value),
    );

  if (scored.length === 0) return null;
  if (new Set(scored.map((entry) => entry.value)).size <= 1) return null;

  return scored.reduce((best, entry) =>
    (higherIsBetter ? entry.value > best.value : entry.value < best.value)
      ? entry
      : best,
  );
}

export function CompareRanking({
  items,
  colors,
  realMode,
}: {
  items: ComparedItem[];
  colors: Map<string, string>;
  /** Vrai quand le plan demande des euros constants : le dire évite de laisser
   *  croire que ces montants sont ceux qu'on lirait sur un relevé. */
  realMode: boolean;
}) {
  const ranked = [...items].sort(
    (a, b) => b.metrics.finalValue - a.metrics.finalValue,
  );
  const leader = ranked[0];

  const criteria = [
    {
      label: "Le plus régulier",
      hint: "volatilité la plus faible",
      leader: leaderOn(items, (m) => m.volatility, false),
      format: (value: number) => formatPercent(value, 1),
    },
    {
      label: "La plus petite baisse",
      hint: "pire recul depuis un sommet",
      leader: leaderOn(items, (m) => m.drawdown.maxDrawdown, true),
      format: (value: number) => formatPercent(value, 1),
    },
    {
      label: "Meilleur rendement/risque",
      hint: "ratio de Sharpe le plus élevé",
      leader: leaderOn(items, (m) => m.sharpe, true),
      format: (value: number) => formatRatio(value),
    },
  ];

  const sweeps = criteria.every(
    (criterion) => criterion.leader?.item.id === leader.id,
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Classement
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Par valeur finale, à plan d&apos;investissement égal
          {realMode ? ", en euros constants" : ""}.
        </p>
      </div>

      <ol className="space-y-2.5">
        {ranked.map((item, index) => {
          const share =
            leader.metrics.finalValue > 0
              ? item.metrics.finalValue / leader.metrics.finalValue
              : 0;

          return (
            <li key={item.id} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="tnum w-3 shrink-0 text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span
                  aria-hidden
                  className="size-2 shrink-0 translate-y-[-1px] rounded-sm"
                  style={{ backgroundColor: colors.get(item.id) }}
                />
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium"
                  title={item.name}
                >
                  {item.name}
                </span>
              </div>

              {/* Barre proportionnelle au premier : la longueur dit l'écart
                  bien plus vite que la lecture de deux montants. */}
              <div className="flex items-center gap-2 pl-5">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(share * 100, 2)}%`,
                      backgroundColor: colors.get(item.id),
                    }}
                  />
                </span>
                <span className="tnum shrink-0 text-xs font-medium">
                  {formatEur(item.metrics.finalValue)}
                </span>
              </div>

              <p className="pl-5 text-[11px] text-muted-foreground">
                {formatSignedPercent(item.metrics.cagr, 1)} par an ·{" "}
                {formatPercent(item.metrics.drawdown.maxDrawdown, 0)} au pire
              </p>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t pt-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sur les autres critères
        </h3>

        {sweeps ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground">{leader.name}</span>{" "}
            l&apos;emporte aussi sur la régularité, la baisse maximale et le
            rapport rendement/risque. C&apos;est rare : le mieux placé a
            d&apos;ordinaire payé son rang en secousses.
          </p>
        ) : (
          <ul className="space-y-2">
            {criteria.map((criterion) => (
              <li key={criterion.label} className="text-[11px] leading-snug">
                <span className="block text-muted-foreground">
                  {criterion.label}
                </span>
                {criterion.leader ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: colors.get(criterion.leader.item.id),
                      }}
                    />
                    <span
                      className="min-w-0 flex-1 truncate font-medium"
                      title={criterion.leader.item.name}
                    >
                      {criterion.leader.item.name}
                    </span>
                    <span className="tnum shrink-0">
                      {criterion.format(criterion.leader.value)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    à égalité ({criterion.hint})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
