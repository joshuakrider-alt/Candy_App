import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartEntry = {
  shopId: number;
  shopName: string;
  catalogId: number;
  name: string;
  imagePath: string;
  priceCents: number;
  quantity: number;
  max: number;
};

type CartState = {
  shopId: number | null;
  shopName: string | null;
  items: CartEntry[];
  add: (item: Omit<CartEntry, "quantity">, quantity?: number) => { switched: boolean };
  setQty: (catalogId: number, quantity: number) => void;
  remove: (catalogId: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      shopId: null,
      shopName: null,
      items: [],
      add: (item, quantity = 1) => {
        const state = get();
        const switched = state.shopId !== null && state.shopId !== item.shopId;
        const existing = switched
          ? undefined
          : state.items.find((line) => line.catalogId === item.catalogId);
        const nextQty = Math.min(item.max, (existing?.quantity ?? 0) + quantity);
        const nextItems = switched
          ? [{ ...item, quantity: Math.min(item.max, quantity) }]
          : existing
            ? state.items.map((line) =>
                line.catalogId === item.catalogId ? { ...line, quantity: nextQty, max: item.max } : line,
              )
            : [...state.items, { ...item, quantity: nextQty }];
        set({
          shopId: item.shopId,
          shopName: item.shopName,
          items: nextItems,
        });
        return { switched };
      },
      setQty: (catalogId, quantity) => {
        set((state) => {
          const items = state.items
            .map((line) =>
              line.catalogId === catalogId
                ? { ...line, quantity: Math.max(0, Math.min(line.max, quantity)) }
                : line,
            )
            .filter((line) => line.quantity > 0);
          return {
            items,
            shopId: items.length ? state.shopId : null,
            shopName: items.length ? state.shopName : null,
          };
        });
      },
      remove: (catalogId) => {
        set((state) => {
          const items = state.items.filter((line) => line.catalogId !== catalogId);
          return {
            items,
            shopId: items.length ? state.shopId : null,
            shopName: items.length ? state.shopName : null,
          };
        });
      },
      clear: () => set({ shopId: null, shopName: null, items: [] }),
    }),
    { name: "candy-lady-cart" },
  ),
);

export function cartCount(items: CartEntry[]): number {
  return items.reduce((sum, line) => sum + line.quantity, 0);
}

export function cartTotalCents(items: CartEntry[]): number {
  return items.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}
