import type { NextConfig } from "next";

// Seller photos live in R2 behind this host (the host of the API's
// STORAGE_PUBLIC_BASE_URL). Only these are resized by Next.js; seller logos
// on any other https host are shown as-is (see components/remote-image.tsx).
const imageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Only the cold-start browser tests change this (playwright.cold.config.ts),
  // so their second build does not overwrite the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Stripe sends buyers back to the old site's addresses. These keep the
  // query string (order, session_id, payment). The /s/<slug> one lives here
  // rather than in the shop page, because reading the query in the page would
  // stop it being cached. After those, every old .html address moves
  // permanently to its new page, so bookmarks and Google results keep working.
  async redirects() {
    return [
      { source: "/buyer.html", has: [{ type: "query", key: "order" }], destination: "/checkout/return", permanent: false },
      {
        source: "/s/:slug",
        has: [{ type: "query", key: "order" }],
        destination: "/checkout/return?shop=:slug",
        permanent: false,
      },
      // Stripe Connect onboarding (?stripe=return|refresh) and Stripe
      // Identity (?identity=return) send sellers back to the old seller page.
      { source: "/seller.html", has: [{ type: "query", key: "stripe" }], destination: "/seller/payouts", permanent: false },
      { source: "/seller.html", has: [{ type: "query", key: "identity" }], destination: "/seller/verify", permanent: false },
      { source: "/buyer.html", destination: "/shops", permanent: true },
      { source: "/shop.html", destination: "/shops", permanent: true },
      { source: "/seller.html", destination: "/seller", permanent: true },
      { source: "/admin.html", destination: "/admin", permanent: true },
      { source: "/apply.html", destination: "/sell/apply", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/:page(about|faq|contact|terms|privacy|pickup).html", destination: "/:page", permanent: true },
    ];
  },
  images: {
    remotePatterns: imageHost ? [{ protocol: "https", hostname: imageHost }] : [],
  },
};

export default nextConfig;
