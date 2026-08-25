"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

/**
 * Section « Détails d'expert » : un trait, un libellé, un repli.
 *
 * C'est le geste central de la refonte grand public — rien n'est supprimé,
 * tout est hiérarchisé. Le repli est mémorisé par écran : un habitué des
 * ratios ne doit pas rouvrir la section à chaque visite, et un débutant qui
 * l'a repliée ne doit pas la voir resurgir.
 */
export function ExpertDetails({
  storageKey,
  children,
}: {
  /** Clé de mémorisation, propre à l'écran hôte. */
  storageKey: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(storageKey) !== "closed";
  });

  function toggle() {
    setOpen((current) => {
      window.localStorage.setItem(storageKey, current ? "closed" : "open");
      return !current;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 pt-2 text-left"
      >
        <span className="font-heading text-base font-bold">
          Détails d&apos;expert
        </span>
        <span aria-hidden className="min-w-0 flex-1 border-t" />
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-primary">
          {open ? "Replier" : "Afficher"}
          {open ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </span>
      </button>

      {open && children}
    </>
  );
}
