import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl bg-paper/95 p-8 text-center shadow-candy">
      <h1 className="text-3xl font-extrabold text-cola">We couldn&apos;t find that page.</h1>
      <p className="text-muted-foreground">The shop may have moved or closed. Every open shop is listed here:</p>
      <Link href="/shops" className={buttonVariants({ className: "h-11 rounded-full px-6 font-extrabold" })}>
        Browse shops
      </Link>
    </section>
  );
}
