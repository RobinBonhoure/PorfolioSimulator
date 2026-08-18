"use client";

import { ChartCandlestick, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/strategies", label: "Mes stratégies" },
  { href: "/strategies/new", label: "Nouvelle stratégie" },
  { href: "/compare", label: "Comparer" },
];

export function AppHeader({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4">
      <Link href="/strategies" className="flex items-center gap-2 font-medium">
        <ChartCandlestick className="size-4" />
        <span className="text-sm">Simulateur de portefeuille</span>
      </Link>

      <Separator orientation="vertical" className="h-5" />

      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          // `/strategies` ne doit pas s'allumer quand on est sur
          // `/strategies/new`, d'où la comparaison exacte pour ce cas.
          const active =
            item.href === "/strategies"
              ? pathname === "/strategies"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 text-sm text-muted-foreground">{userName}</span>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Se déconnecter"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
