import "server-only";
import { flaskUrl } from "@/lib/session";
import type { InventoryItem, Seller, SellerTheme } from "@/lib/types";

// Server-side reads for public pages. Every page that uses these is cached by
// Next.js and refreshed in the background, so visitors never wait on a
// sleeping Render API; only the background refresh does.

export const SHOPS_REVALIDATE = 30;

/** One row of GET /shops. */
export type ShopSummary = {
  id: number;
  slug: string;
  storefront_path: string;
  shop_name: string;
  shop_title?: string;
  tagline: string | null;
  neighborhood: string;
  pickup_window: string;
  logo_url: string | null;
  theme: SellerTheme;
  identity_verified: boolean;
  accepts_card_payments: boolean;
  in_stock_count: number;
};

/** GET /shops/<slug> */
export type Storefront = { seller: Seller; items: InventoryItem[] };

const building = process.env.NEXT_PHASE === "phase-production-build";

async function read<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(flaskUrl(path), {
      next: { revalidate },
      // Render's free tier can take most of a minute to wake.
      signal: AbortSignal.timeout(building ? 20_000 : 55_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Flask ${path} answered ${res.status}`);
    return (await res.json()) as T;
  } catch (error) {
    // At build time an asleep or unreachable API must not fail the deploy:
    // the page is built empty and refreshed on its first visit. After that,
    // throwing is right, because Next.js then keeps serving the last good
    // copy instead of caching an empty one.
    if (building) return null;
    throw error;
  }
}

export async function getShops(): Promise<ShopSummary[]> {
  return (await read<ShopSummary[]>("/shops", SHOPS_REVALIDATE)) ?? [];
}

export async function getShop(slug: string): Promise<Storefront | null> {
  return read<Storefront>(`/shops/${encodeURIComponent(slug)}`, SHOPS_REVALIDATE);
}
