import type { NextConfig } from "next";

// Seller photos live in R2 behind this host (the host of the API's
// STORAGE_PUBLIC_BASE_URL). Only these are resized by Next.js; seller logos
// on any other https host are shown as-is (see components/remote-image.tsx).
const imageHost = process.env.NEXT_PUBLIC_IMAGE_HOST;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: imageHost ? [{ protocol: "https", hostname: imageHost }] : [],
  },
};

export default nextConfig;
