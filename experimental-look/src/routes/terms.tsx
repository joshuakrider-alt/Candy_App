import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Legal</p>
      <h1 className="font-display text-4xl font-extrabold">Marketplace terms</h1>
      <p className="leading-relaxed text-muted">
        The Candy Lady is a marketplace, not the seller. Each candy lady is an independent
        business. We never hold seller funds.
      </p>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Payments</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Checkout is a Direct Charge on the seller’s Stripe Express account. Stripe takes our
          10% application fee automatically. Card data never touches this app.
        </p>
      </section>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Pickup</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Orders are for in-person pickup at the shop’s published window. Bring the pickup
          code. The seller marks the bag ready; you collect it.
        </p>
      </section>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Sellers</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Shops stay hidden until an admin approves them. Payouts require Stripe Connect
          Express. Identity documents are collected by Stripe, not by us.
        </p>
      </section>
      <Link to="/" className="font-bold text-cherry">
        Back home
      </Link>
    </main>
  );
}
