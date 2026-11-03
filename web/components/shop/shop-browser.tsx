"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ShopCard, isOpenNow } from "@/components/shop/shop-card";
import { ShopsLoading, ShopsUnavailable } from "@/components/shop/shops-loading";
import { useShops } from "@/components/shop/use-shops";
import type { ShopSummary } from "@/lib/flask";
import { cn } from "@/lib/utils";

/**
 * Search and filter chips over the shop list. The list itself arrives already
 * rendered from the server; filtering happens in the browser so the page can
 * stay cached. Search covers shop names, neighbourhoods and taglines (Flask
 * has no endpoint that searches every shop's items at once yet).
 *
 * `shops` is null when the server could not reach the API while building the
 * cached page; the list is then fetched here, and the count and "No shops
 * match" only appear once it has arrived.
 */
export function ShopBrowser({ shops: initial }: { shops: ShopSummary[] | null }) {
  const state = useShops(initial);
  const shops = state.status === "ready" ? state.shops : NO_SHOPS;
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [cardOnly, setCardOnly] = useState(false);
  const [stockOnly, setStockOnly] = useState(false);

  // Read ?q= (from the header's search box) after the first render rather than
  // with useSearchParams, which would drop the whole list out of the server
  // HTML that search engines and first paint rely on.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  const areas = useMemo(() => [...new Set(shops.map((s) => s.neighborhood))].sort(), [shops]);

  const visible = shops.filter((shop) => {
    const q = query.trim().toLowerCase();
    if (q && ![shop.shop_name, shop.neighborhood, shop.tagline ?? ""].some((text) => text.toLowerCase().includes(q)))
      return false;
    if (area && shop.neighborhood !== area) return false;
    if (cardOnly && !shop.accepts_card_payments) return false;
    if (stockOnly && !isOpenNow(shop)) return false;
    return true;
  });

  function updateQuery(value: string) {
    setQuery(value);
    // Keep the address shareable without a navigation (which would refetch).
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("q", value);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <label htmlFor="shop-search" className="sr-only">
          Search shops and neighborhoods
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="shop-search"
          type="search"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search shops and neighborhoods"
          className="h-12 w-full rounded-full border border-input bg-white pr-4 pl-12 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div role="group" aria-label="Filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={area === null} onClick={() => setArea(null)}>
          All areas
        </Chip>
        {areas.map((name) => (
          <Chip key={name} active={area === name} onClick={() => setArea(area === name ? null : name)}>
            {name}
          </Chip>
        ))}
        <Chip active={cardOnly} onClick={() => setCardOnly(!cardOnly)}>
          Pays by card
        </Chip>
        <Chip active={stockOnly} onClick={() => setStockOnly(!stockOnly)}>
          Has stock
        </Chip>
      </div>

      {/* Keeps the heading order h1 > h2 > h3 for the shop cards' h3s. */}
      <h2 className="sr-only">Shops</h2>
      {state.status === "loading" ? (
        <ShopsLoading slow={state.slow} count={6} />
      ) : state.status === "error" ? (
        <ShopsUnavailable {...state} />
      ) : (
        <ShopResults visible={visible} anyShops={shops.length > 0} />
      )}
    </div>
  );
}

const NO_SHOPS: ShopSummary[] = [];

function ShopResults({ visible, anyShops }: { visible: ShopSummary[]; anyShops: boolean }) {
  return (
    <>
      <p aria-live="polite" className="text-sm font-bold text-muted-foreground">
        {visible.length} shop{visible.length === 1 ? "" : "s"}
      </p>
      {visible.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((shop) => (
            <li key={shop.id}>
              <ShopCard shop={shop} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-paper/90 p-8 text-center text-muted-foreground shadow-candy">
          {anyShops ? "No shops match. Try another word or clear a filter." : "No shops are open yet. Check back soon."}
        </p>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition",
        active ? "border-cola bg-cola text-cream" : "border-border bg-white/90 text-cola hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
