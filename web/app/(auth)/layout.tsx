import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

// Rendered per request so the Content Security Policy nonce reaches every
// script on these pages (see middleware.ts).
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
        <Link
          href="/"
          className="self-center rounded-full bg-cherry-deep px-5 py-2 font-heading text-2xl font-extrabold text-white shadow-[0_10px_25px_rgba(255,77,109,0.28)]"
        >
          The Candy Lady
        </Link>
        {children}
      </main>
      <SiteFooter tabBar={false} />
    </div>
  );
}
