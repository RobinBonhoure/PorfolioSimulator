"use client";

import { Check, LibraryBig, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CatalogAsset } from "@/lib/db/queries/assets";
import { formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { PeaBadge } from "./pea-badge";
import type { EditorAsset } from "./types";

/**
 * Catalogue parcourable.
 *
 * Complète la barre de recherche, qui suppose de savoir quoi chercher. Deux
 * filtres seulement, et c'est délibéré :
 *
 * - **l'enveloppe**, parce que ce n'est pas une préférence mais une contrainte :
 *   quelqu'un qui n'a qu'un PEA ne *peut pas* détenir les autres supports ;
 * - **le type d'actif**, qui sépare quatre familles sans recouvrement.
 *
 * Il n'y a volontairement pas de filtre par géographie ni par secteur. Un ETF
 * n'est pas *une* zone, il en contient une répartition : sur ce catalogue, neuf
 * ETF sur dix sont à dominante américaine et tous contiennent entre un quart et
 * trois cinquièmes de technologie. Ces filtres n'écarteraient presque rien tout
 * en donnant l'illusion d'un tri. La dominante est donc affichée sur chaque
 * ligne, pour situer un support sans prétendre le classer.
 *
 * Les supports répliquant le même indice sont regroupés : c'est là qu'est
 * l'arbitrage réel de l'utilisateur, trois ETF pouvant suivre le MSCI World en
 * étant tous éligibles au PEA pour des frais allant du simple au double.
 */

type TypeFilter = "all" | "etf" | "stock" | "crypto" | "metal";
type EnvelopeFilter = "all" | "pea" | "cto";

const TYPE_LABELS: Record<Exclude<TypeFilter, "all">, string> = {
  etf: "ETF",
  stock: "Actions",
  crypto: "Crypto",
  metal: "Métaux",
};

export function CatalogueSheet({
  catalog,
  selectedIds,
  onAdd,
}: {
  catalog: CatalogAsset[];
  selectedIds: readonly string[];
  onAdd: (asset: EditorAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TypeFilter>("all");
  const [envelope, setEnvelope] = useState<EnvelopeFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return catalog.filter((asset) => {
      if (type !== "all" && asset.type !== type) return false;
      if (envelope === "pea" && asset.peaEligible !== true) return false;
      if (envelope === "cto" && asset.peaEligible === true) return false;
      if (!needle) return true;

      return (
        asset.shortLabel.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle) ||
        asset.tickerYahoo.toLowerCase().includes(needle)
      );
    });
  }, [catalog, type, envelope, query]);

  /**
   * Regroupement : par indice répliqué quand il y en a un, par famille sinon.
   * Les groupes d'un seul élément ne portent pas d'en-tête d'indice — il
   * n'apporterait rien et alourdirait la liste.
   */
  const groups = useMemo(() => {
    const byKey = new Map<string, CatalogAsset[]>();

    for (const asset of filtered) {
      const key = asset.trackedIndex ?? TYPE_LABELS[asset.type];
      const bucket = byKey.get(key);
      if (bucket) bucket.push(asset);
      else byKey.set(key, [asset]);
    }

    return [...byKey.entries()]
      .map(([label, assets]) => ({
        label,
        assets: [...assets].sort((a, b) => {
          // À indice identique, le moins cher d'abord : c'est l'ordre dans
          // lequel se prend la décision.
          const terA = a.ter === null ? Infinity : Number(a.ter);
          const terB = b.ter === null ? Infinity : Number(b.ter);
          return terA - terB;
        }),
        isIndex: assets[0].trackedIndex !== null,
        isIndexGroup: assets.length > 1 && assets[0].trackedIndex !== null,
      }))
      // Les groupes d'indice passent devant. Trier sur la seule taille
      // remonterait les dix-huit actions en tête, alors que quelqu'un qui
      // compose une allocation cherche d'abord un support indiciel — et les
      // actions individuelles se trouvent très bien par leur nom.
      .sort((a, b) => {
        if (a.isIndex !== b.isIndex) return a.isIndex ? -1 : 1;
        return b.assets.length - a.assets.length;
      });
  }, [filtered]);

  function add(asset: CatalogAsset) {
    onAdd({
      assetId: asset.id,
      tickerYahoo: asset.tickerYahoo,
      shortLabel: asset.shortLabel,
      type: asset.type,
      peaEligible: asset.peaEligible,
      ter: asset.ter === null ? null : Number(asset.ter),
      currency: asset.currency,
      dataPartial: asset.dataPartial,
      weightPercent: 0,
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <LibraryBig className="size-4" />
          Parcourir
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="space-y-3 pb-0">
          <div>
            <SheetTitle>Catalogue</SheetTitle>
            <SheetDescription>
              {filtered.length} actif{filtered.length > 1 ? "s" : ""} sur{" "}
              {catalog.length}. Le panneau reste ouvert : ajoutez-en plusieurs
              d&apos;affilée.
            </SheetDescription>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer par nom ou ticker…"
              className="h-8 pl-8"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={envelope}
              onValueChange={(value) =>
                value && setEnvelope(value as EnvelopeFilter)
              }
            >
              <ToggleGroupItem value="all">Toutes</ToggleGroupItem>
              <ToggleGroupItem value="pea">PEA</ToggleGroupItem>
              <ToggleGroupItem value="cto">Compte-titres</ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={type}
              onValueChange={(value) => value && setType(value as TypeFilter)}
            >
              <ToggleGroupItem value="all">Tout</ToggleGroupItem>
              {(
                Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]
              ).map((key) => (
                <ToggleGroupItem key={key} value={key}>
                  {TYPE_LABELS[key]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-6">
            {groups.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun actif ne correspond à ces critères.
              </p>
            )}

            {groups.map((group) => (
              <section key={group.label} className="space-y-1.5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>

                {group.isIndexGroup && (
                  <p className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
                    Ces supports répliquent le même indice : leur performance
                    brute est quasiment identique, seuls les frais les
                    distinguent durablement. Le moins cher est en tête.
                  </p>
                )}

                <ul className="space-y-1">
                  {group.assets.map((asset) => {
                    const already = selectedIds.includes(asset.id);

                    return (
                      <li key={asset.id}>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => add(asset)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                            already
                              ? "cursor-default opacity-60"
                              : "hover:bg-secondary/60",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">
                              {asset.shortLabel}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {[asset.topGeo, asset.topSector]
                                .filter(Boolean)
                                .join(" · ") || asset.name}
                            </span>
                          </span>

                          <span className="tnum shrink-0 text-xs text-muted-foreground">
                            {asset.ter === null
                              ? "—"
                              : formatPercent(Number(asset.ter))}
                          </span>

                          <PeaBadge eligible={asset.peaEligible} />

                          <span className="shrink-0 text-muted-foreground">
                            {already ? (
                              <Check className="size-4" />
                            ) : (
                              <Plus className="size-4" />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
