import {
  NewStrategyButton,
  StrategyList,
} from "@/components/strategy-list/strategy-list";
import { requireUser } from "@/lib/auth/session";
import { listStrategiesForUser } from "@/lib/db/queries/strategies";

export const metadata = { title: "Mes stratégies — Simulateur de portefeuille" };

export default async function StrategiesPage() {
  const user = await requireUser();
  const strategies = await listStrategiesForUser(user.id);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Mes stratégies
            </h1>
            <p className="text-sm text-muted-foreground">
              {strategies.length === 0
                ? "Aucune stratégie enregistrée."
                : `${strategies.length} stratégie${strategies.length > 1 ? "s" : ""} enregistrée${strategies.length > 1 ? "s" : ""}.`}
            </p>
          </div>
          <NewStrategyButton canCompare={strategies.length >= 2} />
        </div>

        <StrategyList strategies={strategies} />
      </div>
    </div>
  );
}
