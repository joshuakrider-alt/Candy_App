import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refunds")({ component: RefundsPage });

function RefundsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Legal</p>
      <h1 className="font-display text-4xl font-extrabold">Refunds</h1>
      <p className="leading-relaxed text-muted">
        Because the charge sits on the seller’s Stripe account, refunds come from the seller’s
        balance. We can refund our application fee with the charge when that’s the right call.
      </p>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Before pickup</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          If the seller cannot pack the bag, they refund in full — including the platform fee.
          Inventory is restored and the pickup code is void.
        </p>
      </section>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">After pickup</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Food and sealed snacks are generally not returnable once collected. Quality issues
          go through the seller first, then the platform if needed.
        </p>
      </section>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Disputes</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Card disputes are handled in Stripe. Direct Charges mean the seller’s account is the
          merchant of record for the charge.
        </p>
      </section>
      <Link to="/" className="font-bold text-cherry">
        Back home
      </Link>
    </main>
  );
}
