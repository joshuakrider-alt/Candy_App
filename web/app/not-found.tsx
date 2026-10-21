import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// For addresses outside every page group. Shop pages that no longer exist use
// app/(store)/not-found.tsx, which keeps the header and footer.
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-extrabold text-cola">We couldn&apos;t find that page.</h1>
      <Link href="/" className={buttonVariants({ className: "h-11 rounded-full px-6 font-extrabold" })}>
        Go to the home page
      </Link>
    </main>
  );
}
