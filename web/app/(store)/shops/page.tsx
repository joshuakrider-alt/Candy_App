import type { Metadata } from "next";
import { ShopBrowser } from "@/components/shop/shop-browser";
import { getShops } from "@/lib/flask";

// Next.js needs a literal here; keep it equal to SHOPS_REVALIDATE in lib/flask.ts.
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Shops near you",
  description: "Browse approved neighborhood candy and snack shops. Pay by card and pick up with a code.",
};

export default async function ShopsPage() {
  const shops = await getShops();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="mb-1 text-xs font-extrabold tracking-[0.12em] text-ember uppercase">Shop the marketplace</p>
        <h1 className="text-4xl font-extrabold text-cola sm:text-5xl">Shops near you</h1>
        <p className="mt-2 text-muted-foreground">Every shop here was reviewed and approved before it went live.</p>
      </header>
      <ShopBrowser shops={shops} />
    </div>
  );
}
