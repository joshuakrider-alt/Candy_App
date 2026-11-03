import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in and one-off pages have nothing for a search engine.
      disallow: ["/account", "/seller", "/admin", "/checkout", "/cart", "/login", "/signup", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
