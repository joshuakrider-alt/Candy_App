"use client";

import { ShopCard, isOpenNow } from "@/components/shop/shop-card";
import { ShopsLoading, ShopsUnavailable } from "@/components/shop/shops-loading";
import { useShops } from "@/components/shop/use-shops";
import type { ShopSummary } from "@/lib/flask";

/** The home page's "Open now" row. `null` means the server did not know the list yet. */
export function OpenNow({ shops: initial }: { shops: ShopSummary[] | null }) {
  const state = useShops(initial);
  if (state.status === "loading") return <ShopsLoading slow={state.slow} />;
  if (state.status === "error") return <ShopsUnavailable {...state} />;

  const open = state.shops.filter(isOpenNow).slice(0, 6);
  if (!open.length) {
    return (
      <p className="rounded-lg bg-paper/90 p-6 text-muted-foreground shadow-candy">
        {state.shops.length
          ? "Every shop is restocking right now. Check back soon."
          : "No shops are open yet. Check back soon."}
      </p>
    );
  }
  return (
    <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
      {open.map((shop) => (
        <li key={shop.id} className="w-72 shrink-0 snap-start">
          <ShopCard shop={shop} />
        </li>
      ))}
    </ul>
  );
}
