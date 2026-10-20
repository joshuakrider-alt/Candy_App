"use client";

import { ShoppingBag } from "lucide-react";
import { cartCount, useCart, useCartDrawer, useCartReady } from "@/store/cart";

export function CartCount({ className }: { className?: string }) {
  const ready = useCartReady((s) => s.ready);
  const count = useCart((s) => cartCount(s.lines));
  if (!ready || !count) return null;
  return (
    <span
      className={
        className ??
        "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cherry-deep px-1 text-xs font-extrabold text-white"
      }
    >
      {count}
    </span>
  );
}

/** Header cart icon with its item count; opens the drawer. */
export function CartButton() {
  const setOpen = useCartDrawer((s) => s.setOpen);
  const ready = useCartReady((s) => s.ready);
  const count = useCart((s) => cartCount(s.lines));
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={ready && count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      className="relative hidden size-9 items-center justify-center rounded-full border border-border bg-white/80 text-cola hover:bg-accent md:inline-flex"
    >
      <ShoppingBag aria-hidden className="size-4" />
      <CartCount />
    </button>
  );
}
