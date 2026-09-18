import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, MapPin, ShieldCheck, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShopCard } from "@/components/shop-card";
import { Skeleton } from "@/components/ui/skeleton";
import { listShops } from "@/lib/candy/server";
import type { ShopCard as Shop } from "@/lib/candy/types";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [shops, setShops] = useState<Shop[] | null>(null);

  useEffect(() => {
    void listShops().then(setShops);
  }, []);

  return (
    <main className="flex flex-col gap-12">
      <section className="grid items-center gap-8 overflow-hidden rounded-[28px] bg-paper p-6 shadow-[var(--shadow-card)] md:grid-cols-[1.05fr_0.95fr] md:p-10">
        <div className="flex flex-col gap-5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
            Neighborhood snack marketplace
          </p>
          <h1 className="max-w-[10ch] font-display text-5xl font-extrabold md:text-6xl">
            Your neighborhood snack stop.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted">
            Approved local sellers stock candy, chips, and cold drinks. You pay the seller
            directly. We take a 10% fee. Pickup with a code.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/shop">Shop the marketplace</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/apply">Become a seller</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm font-bold">
            {["Paid to the seller", "We never hold funds", "Pickup codes"].map((tag) => (
              <li key={tag} className="rounded-full bg-foam px-3 py-2">
                {tag}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <img
            src="/candy/shop-kiki.jpg"
            alt="A porch snack stand under a cherry-striped awning"
            className="media aspect-[4/3] w-full rounded-[22px] object-cover"
          />
          <div className="absolute bottom-4 left-4 right-4 rounded-[16px] bg-paper/95 p-4 shadow-[var(--shadow-card)]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
              Open now
            </p>
            <p className="font-display text-2xl font-extrabold">Ms. Kiki's Snack Spot</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <MapPin className="size-4" />
              Cherry Hill · pickup today
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Approved products only",
            body: "Every seller stocks from a controlled catalog of candy, chips, and drinks.",
            icon: ShieldCheck,
          },
          {
            title: "Money goes to the lady",
            body: "Direct Charges on Stripe Connect. Platform takes 10%. We never sit on a seller balance.",
            icon: Banknote,
          },
          {
            title: "Pay, then collect",
            body: "Checkout reserves the bag. The seller packs, marks ready, and you pick up with a code.",
            icon: Clock,
          },
        ].map((item) => (
          <article key={item.title} className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
            <item.icon className="size-5 text-cherry" />
            <h2 className="mt-3 font-display text-2xl font-extrabold">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Nearby now</p>
            <h2 className="font-display text-3xl font-extrabold">Shop the spots that are open.</h2>
          </div>
          <Link to="/launch" className="text-sm font-extrabold text-cherry">
            See the rebuild plan
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {shops
            ? shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)
            : [0, 1].map((key) => <Skeleton key={key} className="h-80" />)}
        </div>
      </section>
    </main>
  );
}
