import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShopCard } from "@/components/shop-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listShops } from "@/lib/candy/server";
import type { ShopCard as Shop } from "@/lib/candy/types";

export const Route = createFileRoute("/shop/")({ component: ShopIndex });

const FILTERS = ["all", "Cherry Hill", "Northview", "Eastside"] as const;

function ShopIndex() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  useEffect(() => {
    void listShops().then(setShops);
  }, []);

  const visible = useMemo(() => {
    if (!shops) return [];
    const q = query.trim().toLowerCase();
    return shops.filter((shop) => {
      const matchQ =
        !q ||
        shop.shopName.toLowerCase().includes(q) ||
        shop.neighborhood.toLowerCase().includes(q);
      const matchN = filter === "all" || shop.neighborhood === filter;
      return matchQ && matchN;
    });
  }, [shops, query, filter]);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
          Marketplace
        </p>
        <h1 className="font-display text-4xl font-extrabold">Approved snack spots.</h1>
        <p className="max-w-xl text-muted">
          Browse every live shop, compare what’s in stock, and order from the one closest to you.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-[22px] bg-paper p-4 shadow-[var(--shadow-card)]">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shops or neighborhoods"
          aria-label="Search shops"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "min-h-10 rounded-full px-4 text-sm font-bold",
                filter === item ? "bg-cherry text-cream" : "bg-foam text-ink",
              )}
            >
              {item === "all" ? "All neighborhoods" : item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {!shops
          ? [0, 1].map((key) => <Skeleton key={key} className="h-80" />)
          : visible.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
      </div>
      {shops && visible.length === 0 ? (
        <p className="text-sm font-bold text-muted">No shops match that search.</p>
      ) : null}
    </main>
  );
}
