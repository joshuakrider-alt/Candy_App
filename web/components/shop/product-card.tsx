"use client";

import { Candy, CupSoda, Popcorn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QtyStepper } from "@/components/cart/qty-stepper";
import { RemoteImage } from "@/components/remote-image";
import { money } from "@/lib/format";
import type { Category, InventoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CATEGORY_LABELS: Record<Category, string> = { candy: "Candy", chips: "Chips", drinks: "Drinks" };

const CATEGORY_ART: Record<Category, { icon: typeof Candy; tint: string }> = {
  candy: { icon: Candy, tint: "bg-bubblegum/30 text-cherry-deep" },
  chips: { icon: Popcorn, tint: "bg-lemon/50 text-ember" },
  drinks: { icon: CupSoda, tint: "bg-soda-aqua/30 text-cola" },
};

/** The item's approved photo, or art for its category. */
export function ProductArt({
  item,
  photoUrl,
  sizes,
  className,
}: {
  item: InventoryItem;
  photoUrl: string | null;
  sizes: string;
  className?: string;
}) {
  const category = item.candy?.category ?? "candy";
  const art = CATEGORY_ART[category];
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-md", !photoUrl && art.tint, className)}>
      {photoUrl ? (
        <RemoteImage src={photoUrl} alt={item.candy?.name ?? ""} fill sizes={sizes} className="object-cover" />
      ) : (
        <art.icon aria-hidden className="absolute inset-0 m-auto size-1/3" strokeWidth={1.5} />
      )}
    </div>
  );
}

export function stockNote(item: InventoryItem) {
  return item.status === "low-stock" ? `Only ${item.inventory_count} left` : null;
}

/** Product card with quick add: Add turns into a −/+ stepper once in the cart. */
export function ProductCard({
  item,
  photoUrl,
  qtyInCart,
  onAdd,
  onSetQty,
  onOpen,
  accentStyle,
}: {
  item: InventoryItem;
  photoUrl: string | null;
  qtyInCart: number;
  onAdd: () => void;
  onSetQty: (qty: number) => void;
  onOpen: () => void;
  accentStyle?: React.CSSProperties;
}) {
  const candy = item.candy!;
  const note = stockNote(item);
  return (
    <article className="flex h-full flex-col gap-2 rounded-lg bg-paper p-3 shadow-candy">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`More about ${candy.name}`}
        className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ProductArt item={item} photoUrl={photoUrl} sizes="(min-width: 1024px) 220px, 45vw" />
      </button>
      <div className="flex flex-1 flex-col">
        <h3 className="leading-tight font-bold text-cola">{candy.name}</h3>
        <p className="font-extrabold text-cola">{money(candy.price_cents)}</p>
        {note && <p className="text-sm font-bold text-ember">{note}</p>}
      </div>
      {qtyInCart > 0 ? (
        <QtyStepper qty={qtyInCart} max={item.inventory_count} name={candy.name} onChange={onSetQty} className="self-start" />
      ) : (
        <Button onClick={onAdd} className="h-9 rounded-full font-extrabold" style={accentStyle}>
          Add
        </Button>
      )}
    </article>
  );
}
