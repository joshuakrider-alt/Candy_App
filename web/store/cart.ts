"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// One shop per cart, because Flask's POST /orders takes one seller_id. Saved
// in the browser under "cl-cart". Based on the plan's store/cart.ts, plus the
// shop's slug (for "back to shop" links and Stripe's return_to) and each
// line's stock limit.

export type Line = {
  candyId: number;
  name: string;
  priceCents: number;
  qty: number;
  /** Units in stock when last seen; the cart never goes above it. */
  max: number;
};

export type CartShop = { id: number; name: string; slug: string | null };

export type AddResult = "added" | "other-shop" | "sold-out";

type Cart = {
  sellerId: number | null;
  shopName: string | null;
  shopSlug: string | null;
  lines: Line[];
  add: (shop: CartShop, line: Omit<Line, "qty">, qty?: number) => AddResult;
  startOver: (shop: CartShop) => void;
  setQty: (candyId: number, qty: number) => void;
  /** Applies fresh stock counts from a shop page: lowers or drops lines that no longer fit. */
  syncStock: (shop: CartShop, counts: Map<number, number>) => void;
  clear: () => void;
  /** Takes a paid order's items out of the cart, leaving anything added since (or another shop's cart) alone. */
  removePaid: (order: { seller_id: number; items: { candy_id: number; quantity: number }[] }) => void;
};

const empty = { sellerId: null, shopName: null, shopSlug: null, lines: [] as Line[] };

export const useCart = create<Cart>()(
  persist(
    (set, get) => ({
      ...empty,
      add: (shop, line, qty = 1) => {
        const { sellerId, lines } = get();
        if (sellerId !== null && sellerId !== shop.id) return "other-shop"; // UI asks to start over
        const have = lines.find((l) => l.candyId === line.candyId)?.qty ?? 0;
        if (have + qty > line.max) return "sold-out";
        const next = have
          ? lines.map((l) => (l.candyId === line.candyId ? { ...l, ...line, qty: have + qty } : l))
          : [...lines, { ...line, qty }];
        set({ sellerId: shop.id, shopName: shop.name, shopSlug: shop.slug, lines: next });
        return "added";
      },
      startOver: (shop) => set({ sellerId: shop.id, shopName: shop.name, shopSlug: shop.slug, lines: [] }),
      setQty: (candyId, qty) => {
        const lines = get()
          .lines.map((l) => (l.candyId === candyId ? { ...l, qty: Math.min(qty, l.max) } : l))
          .filter((l) => l.qty > 0);
        set(lines.length ? { lines } : empty);
      },
      syncStock: (shop, counts) => {
        if (get().sellerId !== shop.id) return;
        const lines = get()
          .lines.map((l) => {
            const max = counts.get(l.candyId) ?? 0;
            return { ...l, max, qty: Math.min(l.qty, max) };
          })
          .filter((l) => l.qty > 0);
        // A cart carried over from the old site has no shop name until now.
        set(lines.length ? { lines, shopName: shop.name, shopSlug: shop.slug } : empty);
      },
      clear: () => set(empty),
      removePaid: (order) => {
        if (get().sellerId !== order.seller_id) return;
        const paid = new Map(order.items.map((item) => [item.candy_id, item.quantity]));
        const lines = get()
          .lines.map((l) => ({ ...l, qty: l.qty - (paid.get(l.candyId) ?? 0) }))
          .filter((l) => l.qty > 0);
        set(lines.length ? { lines } : empty);
      },
    }),
    {
      name: "cl-cart",
      storage: createJSONStorage(() => localStorage),
      // Rehydrated by CartBootstrap after the first render, so the server's
      // empty cart and the browser's first paint match.
      skipHydration: true,
      version: 1,
    },
  ),
);

export const cartCount = (lines: Line[]) => lines.reduce((sum, l) => sum + l.qty, 0);
export const cartTotal = (lines: Line[]) => lines.reduce((sum, l) => sum + l.qty * l.priceCents, 0);

/** Whether the cart drawer is open. Not saved. */
export const useCartDrawer = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Whether the saved cart has been loaded into the store yet. */
export const useCartReady = create<{ ready: boolean }>()(() => ({ ready: false }));
