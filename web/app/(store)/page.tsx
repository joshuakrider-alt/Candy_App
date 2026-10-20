import Link from "next/link";
import { Candy, CupSoda, Popcorn, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ShopCard, isOpenNow } from "@/components/shop/shop-card";
import { getShops } from "@/lib/flask";

// Cached and refreshed every 60 s.
export const revalidate = 60;

const CATEGORIES = [
  { label: "Candy", blurb: "Gummies, chocolate, lollipops", icon: Candy, tint: "bg-bubblegum/40" },
  { label: "Chips", blurb: "Hot, cheesy, salty, crunchy", icon: Popcorn, tint: "bg-lemon/60" },
  { label: "Drinks", blurb: "Cold soda, juice, lemonade", icon: CupSoda, tint: "bg-soda-aqua/40" },
];

const STEPS = [
  { title: "Pick a shop", text: "Browse approved sellers in your neighborhood and add what you want." },
  { title: "Pay by card", text: "Your items are held for you the moment you pay. You get a pickup code." },
  { title: "Walk over", text: "When the seller marks it ready, show your code at pickup." },
];

export default async function HomePage() {
  const shops = await getShops();
  const open = shops.filter(isOpenNow).slice(0, 6);

  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-xl bg-paper/90 p-6 shadow-candy sm:p-10">
        <p className="mb-2 text-xs font-extrabold tracking-[0.12em] text-ember uppercase">Neighborhood snack marketplace</p>
        <h1 className="max-w-3xl text-4xl leading-tight font-extrabold text-cola sm:text-6xl">
          Your neighborhood snack stop.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Discover approved local candy sellers with stocked chips, cold drinks, and sweet treats right around the
          corner. Pay by card and collect with a pickup code.
        </p>
        <form action="/shops" role="search" className="relative mt-6 max-w-xl">
          <label htmlFor="hero-search" className="sr-only">
            Search shops and neighborhoods
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="hero-search"
            name="q"
            type="search"
            placeholder="Search shops and neighborhoods"
            className="h-14 w-full rounded-full border border-input bg-white pr-32 pl-12 text-base shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="submit"
            className={buttonVariants({ className: "absolute top-2 right-2 h-10 rounded-full px-5 font-extrabold" })}
          >
            Search
          </button>
        </form>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/shops" className={buttonVariants({ variant: "outline", className: "h-11 rounded-full px-5 font-extrabold" })}>
            See every shop
          </Link>
          <Link href="/sell/apply" className={buttonVariants({ variant: "ghost", className: "h-11 rounded-full px-5 font-extrabold" })}>
            Become a seller
          </Link>
        </div>
      </section>

      <section aria-labelledby="open-now" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 id="open-now" className="text-3xl font-extrabold text-cola">
            Open now
          </h2>
          <Link href="/shops" className="font-bold text-cherry-deep underline">
            All shops
          </Link>
        </div>
        {open.length ? (
          <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {open.map((shop) => (
              <li key={shop.id} className="w-72 shrink-0 snap-start">
                <ShopCard shop={shop} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-paper/90 p-6 text-muted-foreground shadow-candy">
            Every shop is restocking right now. Check back soon.
          </p>
        )}
      </section>

      <section aria-labelledby="what" className="flex flex-col gap-4">
        <h2 id="what" className="text-3xl font-extrabold text-cola">
          What&apos;s on the shelves
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {CATEGORIES.map(({ label, blurb, icon: Icon, tint }) => (
            <li key={label}>
              <Link href="/shops" className={`flex items-center gap-4 rounded-lg p-5 shadow-candy transition hover:-translate-y-0.5 ${tint}`}>
                <Icon aria-hidden className="size-10 text-cola" strokeWidth={1.5} />
                <span>
                  <span className="block font-heading text-2xl font-extrabold text-cola">{label}</span>
                  <span className="text-sm text-cola">{blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="rounded-xl bg-cola p-6 text-cream sm:p-10">
        <h2 id="how" className="text-3xl font-extrabold text-lemon">
          How pickup works
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cherry-deep font-heading text-xl font-extrabold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block font-heading text-xl font-bold">{step.title}</span>
                <span className="text-cream/85">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link href="/pickup" className="mt-6 inline-block font-bold text-lemon underline">
          Pickup and refunds
        </Link>
      </section>
    </div>
  );
}
