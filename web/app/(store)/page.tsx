import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Placeholder until Day 2 builds the real home page (open shops, category
// tiles, how pickup works).
export default function HomePage() {
  return (
    <section className="rounded-xl bg-paper/90 p-8 shadow-candy">
      <p className="mb-2 text-xs font-extrabold tracking-[0.12em] text-ember uppercase">
        Neighborhood snack marketplace
      </p>
      <h1 className="text-4xl font-extrabold text-cola sm:text-5xl">Your neighborhood snack stop.</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Discover approved local candy sellers with stocked chips, cold drinks, and sweet treats right around the
        corner. Pay by card and collect with a pickup code.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/shops" className={buttonVariants({ size: "lg", className: "h-12 rounded-full px-6 font-extrabold" })}>
          Shop the marketplace
        </Link>
        <Link
          href="/sell/apply"
          className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 rounded-full px-6 font-extrabold" })}
        >
          Become a seller
        </Link>
      </div>
    </section>
  );
}
