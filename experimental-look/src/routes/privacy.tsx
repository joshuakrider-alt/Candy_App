import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Legal</p>
      <h1 className="font-display text-4xl font-extrabold">Privacy</h1>
      <p className="leading-relaxed text-muted">
        The Candy Lady is a neighborhood snack marketplace. We keep as little as we need to run
        pickup orders, and we do not store identity documents on this platform.
      </p>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">What we store</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>Account name, email, and role so you can sign in.</li>
          <li>Shop profiles, catalog stock, and paid order details including pickup codes.</li>
          <li>An identity status only — verified or not — never the ID document or selfie.</li>
        </ul>
      </section>
      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">What we do not store</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>Government ID photos and selfies live with Stripe Identity on the live site, not here.</li>
          <li>Card numbers never touch this app. Live payments are Direct Charges on the seller’s Stripe account.</li>
          <li>This preview marks orders paid locally so you can try pickup codes without a card.</li>
        </ul>
      </section>
      <div className="flex flex-wrap gap-4">
        <Link to="/" className="font-bold text-cherry">
          Back home
        </Link>
        <Link to="/terms" className="font-bold text-cherry">
          Terms
        </Link>
        <Link to="/refunds" className="font-bold text-cherry">
          Refunds
        </Link>
      </div>
    </main>
  );
}
