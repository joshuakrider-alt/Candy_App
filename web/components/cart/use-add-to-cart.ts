"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { useCart, useCartDrawer, type CartShop, type Line } from "@/store/cart";

type Pending = { shop: CartShop; line: Omit<Line, "qty"> } | null;

/** An add that is waiting on "start a new cart?". Shown by SwitchShopDialog. */
export const usePendingSwitch = create<{ pending: Pending; setPending: (p: Pending) => void }>()((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));

/** Adds one unit, opening the drawer, the switch-shop dialog, or a stock message as needed. */
export function useAddToCart() {
  const add = useCart((s) => s.add);
  const openDrawer = useCartDrawer((s) => s.setOpen);
  const setPending = usePendingSwitch((s) => s.setPending);

  return (shop: CartShop, line: Omit<Line, "qty">) => {
    const result = add(shop, line);
    if (result === "added") openDrawer(true);
    else if (result === "other-shop") setPending({ shop, line });
    else toast.error(`Only ${line.max} of ${line.name} in stock.`);
    return result;
  };
}
