"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Bascule clair / sombre.
 *
 * L'icône est choisie par CSS et non par état React. Le motif habituel — un
 * drapeau « monté » posé dans un effet — provoque un rendu en cascade à chaque
 * chargement et fait clignoter l'icône, puisque le thème résolu n'est connu
 * qu'après hydratation. Ici, les deux icônes sont rendues et la classe `dark`
 * posée sur `<html>` par next-themes décide laquelle s'affiche : le bon
 * pictogramme est correct dès la première peinture, sans JavaScript.
 *
 * Le gestionnaire de clic, lui, lit le thème résolu — il ne s'exécute qu'après
 * hydratation, moment où cette valeur est fiable.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Changer de thème"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
