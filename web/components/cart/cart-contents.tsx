"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";
import { CheckoutButton } from "@/components/cart/checkout-button";
import { Skeleton } from "@/components/ui/skeleton";
import { QtyStepper } from "@/components/cart/qty-stepper";
import { money } from "@/lib/format";
import { cartTotal, useCart, useCartReady } from "@/store/cart";

/** The cart's lines, subtotal and pay button. Used by the drawer and /cart. */
export function CartContents({ onNavigate }: { onNavigate?: () => void }) {
  const ready = useCartReady((s) => s.ready);
  const { lines, shopName, shopSlug, setQty } = useCart();
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <ShoppingBag aria-hidden className="size-10 text-bubblegum" />
        <p className="font-heading text-xl font-bold text-cola">Your cart is empty.</p>
        <Link href="/shops" onClick={onNavigate} className="font-bold text-cherry-deep underline">
          Browse shops
        </Link>
      </div>
    );
  }

  const total = cartTotal(lines);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        From{" "}
        {shopSlug ? (
          <Link href={`/s/${shopSlug}`} onClick={onNavigate} className="font-bold text-cola underline">
            {shopName}
          </Link>
        ) : (
          <span className="font-bold text-cola">{shopName ?? "your shop"}</span>
        )}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {lines.map((line) => (
          <li key={line.candyId} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-cola">{line.name}</p>
              <p className="text-sm text-muted-foreground">
                {money(line.priceCents)} each
                {line.qty >= line.max && <span className="ml-2 font-bold text-ember">All {line.max} in stock</span>}
              </p>
            </div>
            <QtyStepper qty={line.qty} max={line.max} name={line.name} onChange={(qty) => setQty(line.candyId, qty)} />
            <p className="w-16 text-right font-extrabold tabular-nums">{money(line.priceCents * line.qty)}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-4 text-lg">
        <span className="font-bold">Subtotal</span>
        <span className="font-extrabold tabular-nums">{money(total)}</span>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">
          {error}
        </p>
      )}
      <CheckoutButton onError={setError} />
      <p className="text-center text-sm text-muted-foreground">
        Pay by card, then pick up at the shop with your code. No delivery.
      </p>
    </div>
  );
}
