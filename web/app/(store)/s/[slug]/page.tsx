import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopView } from "@/components/shop/shop-view";
import { getShop } from "@/lib/flask";

// Rendered on first visit, then cached and refreshed every 30 s (keep equal
// to SHOPS_REVALIDATE in lib/flask.ts), so a sleeping API never makes a
// buyer wait.
export const revalidate = 30;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShop((await params).slug);
  if (!shop) return { title: "Shop not found" };
  const { seller, items } = shop;
  const description =
    seller.tagline ??
    `${seller.shop_name} in ${seller.neighborhood}: ${items.length} snack${items.length === 1 ? "" : "s"} for pickup, ${seller.pickup_window}.`;
  return {
    title: seller.shop_name,
    description,
    alternates: { canonical: `/s/${seller.slug}` },
    openGraph: {
      title: `${seller.shop_name} | The Candy Lady`,
      description,
      url: `/s/${seller.slug}`,
      images: seller.logo_url ? [{ url: seller.logo_url }] : undefined,
    },
  };
}

export default async function ShopPage({ params }: Props) {
  const shop = await getShop((await params).slug);
  if (!shop) notFound();
  return <ShopView storefront={shop} />;
}
