import type { MetadataRoute } from "next";
import { getShops } from "@/lib/flask";
import { SITE_URL } from "@/lib/site";

// Rebuilt at most hourly, so a newly approved shop is listed within the hour.
export const revalidate = 3600;

const PAGES = ["", "/shops", "/sell/apply", "/about", "/faq", "/contact", "/pickup", "/terms", "/privacy"];

/** Every public page plus every approved shop: the old sitemap had no shop pages at all. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const shops = await getShops().catch(() => []);
  return [
    ...PAGES.map((path) => ({ url: `${SITE_URL}${path || "/"}` })),
    ...shops.map((shop) => ({ url: `${SITE_URL}/s/${shop.slug}`, changeFrequency: "daily" as const })),
  ];
}
