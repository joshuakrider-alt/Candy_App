import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { Providers } from "@/components/providers";
import { INDEXABLE, SITE_URL } from "@/lib/site";
import "./globals.css";

// Same fonts as the old site, self-hosted by Next.js: no request to Google.
const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "The Candy Lady | Neighborhood snack marketplace",
    template: "%s | The Candy Lady",
  },
  description:
    "Shop approved neighborhood candy sellers, pay by card, and pick up with a code. Candy, sweets, snacks and cold drinks you can walk to.",
  openGraph: { siteName: "The Candy Lady", type: "website" },
  // beta and previews stay out of search results (see lib/site.ts).
  ...(INDEXABLE ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = { themeColor: "#ff4d6d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
