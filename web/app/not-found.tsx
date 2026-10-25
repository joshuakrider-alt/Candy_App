import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";

// For addresses outside every page group. Shop pages that no longer exist use
// app/(store)/not-found.tsx, which keeps the header and footer.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <main id="main" className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-extrabold text-cola">We couldn&apos;t find that page.</h1>
        <Link href="/" className={buttonVariants({ className: "h-11 rounded-full px-6 font-extrabold" })}>
          Go to the home page
        </Link>
      </main>
      <SiteFooter tabBar={false} />
    </div>
  );
}
