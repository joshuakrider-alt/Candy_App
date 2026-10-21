"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Clock, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QtyStepper } from "@/components/cart/qty-stepper";
import { useAddToCart } from "@/components/cart/use-add-to-cart";
import { RemoteImage } from "@/components/remote-image";
import { CATEGORY_LABELS, ProductArt, ProductCard, stockNote } from "@/components/shop/product-card";
import { ShopLogo } from "@/components/shop/shop-logo";
import type { Storefront } from "@/lib/flask";
import { isHexColor, money } from "@/lib/format";
import type { Category, InventoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCart, useCartReady, type CartShop } from "@/store/cart";

export function ShopView({ storefront }: { storefront: Storefront }) {
  const { seller } = storefront;
  const items = useMemo(() => storefront.items.filter((i) => i.candy), [storefront.items]);
  const shop: CartShop = { id: seller.id, name: seller.shop_name, slug: seller.slug };

  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [openItem, setOpenItem] = useState<InventoryItem | null>(null);

  const addToCart = useAddToCart();
  const ready = useCartReady((s) => s.ready);
  const cart = useCart();
  const qtyInCart = (candyId: number) =>
    ready && cart.sellerId === seller.id ? (cart.lines.find((l) => l.candyId === candyId)?.qty ?? 0) : 0;

  // Fresh stock from this page lowers anything in the cart that no longer fits.
  useEffect(() => {
    if (!ready) return;
    useCart.getState().syncStock(
      { id: seller.id, name: seller.shop_name, slug: seller.slug },
      new Map(items.map((i) => [i.candy_id, i.inventory_count])),
    );
  }, [ready, items, seller.id, seller.shop_name, seller.slug]);

  // Shop colours were checked as #rrggbb by Flask; checked again before use.
  const primary = isHexColor(seller.theme.primary) ? seller.theme.primary : null;
  const accent = isHexColor(seller.theme.accent) ? seller.theme.accent : null;
  const heroStyle = primary ? { background: primary, color: seller.theme.on_primary ?? "#ffffff" } : undefined;
  const accentStyle = accent ? { background: accent, color: seller.theme.on_accent ?? "#ffffff" } : undefined;

  const photoFor = (candyId: number) => seller.photos?.find((p) => p.candy_id === candyId && p.url)?.url ?? null;
  const shelfPhotos = (seller.photos ?? []).filter((p) => p.candy_id === null && p.url);
  const categories = (["candy", "chips", "drinks"] as const).filter((c) => items.some((i) => i.candy!.category === c));
  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (category === "all" || i.candy!.category === category) &&
      (!q || `${i.candy!.name} ${i.candy!.description ?? ""}`.toLowerCase().includes(q)),
  );

  const line = (item: InventoryItem) => ({
    candyId: item.candy_id,
    name: item.candy!.name,
    priceCents: item.candy!.price_cents,
    max: item.inventory_count,
  });

  return (
    <div className="flex flex-col gap-6">
      <section
        className={cn("flex flex-col gap-4 rounded-xl p-6 shadow-candy sm:p-8", !primary && "bg-paper/95 text-cola")}
        style={heroStyle}
      >
        <div className="flex items-center gap-4">
          <ShopLogo name={seller.shop_name} logoUrl={seller.logo_url} theme={seller.theme} className="size-20 ring-4 ring-white/70" />
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight font-extrabold sm:text-5xl">{seller.shop_name}</h1>
            {seller.tagline && <p className="mt-1 text-lg opacity-90">{seller.tagline}</p>}
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 font-bold">
          <li className="flex items-center gap-1.5">
            <MapPin aria-hidden className="size-4" /> {seller.neighborhood}
          </li>
          <li className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-4" /> Pickup: {seller.pickup_window}
          </li>
          {seller.identity_verified && (
            <li className="flex items-center gap-1.5">
              <BadgeCheck aria-hidden className="size-4" /> ID verified
            </li>
          )}
        </ul>
        {!seller.accepts_card_payments && (
          <p className="rounded-md bg-white/85 px-3 py-2 text-sm font-bold text-cola">
            This shop is still setting up card payments, so orders can&apos;t be placed yet.
          </p>
        )}
      </section>

      {shelfPhotos.length > 0 && (
        <section aria-label="From the shelf" className="-mx-4 flex gap-3 overflow-x-auto px-4">
          {shelfPhotos.map((photo) => (
            <figure key={photo.id} className="relative h-40 w-56 shrink-0 overflow-hidden rounded-lg shadow-candy">
              <RemoteImage src={photo.url!} alt={photo.caption ?? `${seller.shop_name} shelf`} fill sizes="224px" className="object-cover" />
            </figure>
          ))}
        </section>
      )}

      <div className="sticky top-16 z-30 -mx-4 flex flex-col gap-3 bg-paper/90 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Categories" className="flex gap-2 overflow-x-auto">
          {(["all", ...categories] as const).map((c) => (
            <button
              key={c}
              role="tab"
              type="button"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm font-bold",
                category === c ? "border-cola bg-cola text-cream" : "border-border bg-white text-cola hover:bg-accent",
              )}
            >
              {c === "all" ? "Everything" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <label htmlFor="item-search" className="sr-only">
            Search this shop
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="item-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this shop"
            className="h-9 w-full rounded-full border border-input bg-white pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>

      {/* Keeps the heading order h1 > h2 > h3 for the product cards' h3s. */}
      <h2 className="sr-only">On the shelf</h2>
      {visible.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <li key={item.id}>
              <ProductCard
                item={item}
                photoUrl={photoFor(item.candy_id)}
                qtyInCart={qtyInCart(item.candy_id)}
                onAdd={() => addToCart(shop, line(item))}
                onSetQty={(qty) => cart.setQty(item.candy_id, qty)}
                onOpen={() => setOpenItem(item)}
                accentStyle={accentStyle}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-paper/90 p-8 text-center text-muted-foreground shadow-candy">
          {items.length ? "Nothing here matches. Try another word or category." : "This shop is restocking. Check back soon."}
        </p>
      )}

      <Dialog open={openItem !== null} onOpenChange={(open) => !open && setOpenItem(null)}>
        {openItem && (
          <DialogContent className="sm:max-w-md">
            <ProductArt item={openItem} photoUrl={photoFor(openItem.candy_id)} sizes="(min-width: 640px) 400px, 90vw" />
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl font-extrabold text-cola">{openItem.candy!.name}</DialogTitle>
              {openItem.candy!.description && <DialogDescription>{openItem.candy!.description}</DialogDescription>}
            </DialogHeader>
            {/* The buy box: price, units left, and where to collect. */}
            <div className="flex flex-col gap-1 rounded-md bg-muted p-3 text-sm text-cola">
              <p className="text-xl font-extrabold">{money(openItem.candy!.price_cents)}</p>
              <p>
                <Badge variant="outline" className="mr-2 text-cola">
                  {openItem.inventory_count} left
                </Badge>
                {stockNote(openItem)}
              </p>
              <p>
                Pick up at {seller.shop_name}, {seller.pickup_window}
              </p>
            </div>
            {qtyInCart(openItem.candy_id) > 0 ? (
              <QtyStepper
                qty={qtyInCart(openItem.candy_id)}
                max={openItem.inventory_count}
                name={openItem.candy!.name}
                onChange={(qty) => cart.setQty(openItem.candy_id, qty)}
                className="self-start"
              />
            ) : (
              <Button
                className="h-11 rounded-full font-extrabold"
                style={accentStyle}
                onClick={() => {
                  if (addToCart(shop, line(openItem)) !== "sold-out") setOpenItem(null);
                }}
              >
                Add to cart
              </Button>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
