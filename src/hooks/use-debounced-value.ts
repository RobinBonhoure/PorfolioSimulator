"use client";

import { useEffect, useState } from "react";

/**
 * Valeur retardée.
 *
 * Prévue pour des valeurs comparables par identité — chaînes, nombres, `null` —
 * et non pour des objets reconstruits à chaque rendu, qui relanceraient le
 * minuteur indéfiniment. Sérialiser en amont est le moyen le plus simple de
 * s'en assurer.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
