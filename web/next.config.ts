import type { NextConfig } from "next";

// Seller photos live in R2 behind this host (the host of the API's
// STORAGE_PUBLIC_BASE_URL). Only these are resized by Next.js; seller logos
// on any other https host are shown as-is (see components/remote-image.tsx).
const imageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Stripe sends buyers back to the old site's addresses. These keep the
  // query string (order, session_id, payment). The /s/<slug> one lives here
  // rather than in the shop page, because reading the query in the page would
  // stop it being cached. The rest of the old-address redirects come on Day 5.
  async redirects() {
    return [
      { source: "/buyer.html", has: [{ type: "query", key: "order" }], destination: "/checkout/return", permanent: false },
      {
        source: "/s/:slug",
        has: [{ type: "query", key: "order" }],
        destination: "/checkout/return?shop=:slug",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: imageHost ? [{ protocol: "https", hostname: imageHost }] : [],
  },
};

export default nextConfig;
