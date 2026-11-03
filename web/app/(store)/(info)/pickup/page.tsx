import type { Metadata } from "next";
import Link from "next/link";

// Ported from the old site's pickup.html.
export const metadata: Metadata = {
  title: "Pickup & Refunds",
  description: "How pickup, cancellations, and refunds work for The Candy Lady marketplace orders.",
};

export default function PickupPage() {
  return (
    <div className="info-page">
      <section className="info-hero"><p className="eyebrow">Pickup &amp; refunds</p><h1>Get your bag, or get help with an order.</h1><p className="hero-text">Orders are picked up directly from the neighborhood seller you chose. Here is what to check before you head over.</p><p className="hero-text"><strong>Last updated: September 25, 2026</strong></p></section>
      <section className="panel"><h2>Before pickup</h2><ul><li>Wait until the seller marks your order ready.</li><li>Check the shop&apos;s pickup hours, location, and notes.</li><li>Bring the pickup code shown with your order.</li></ul><p>There is no delivery and no central The Candy Lady pickup counter.</p></section>
      <section className="panel"><h2>At pickup</h2><p>Go to the seller listed on your order during their pickup hours and follow their instructions. Show the seller your pickup code so they can match you with the right paid order. Do not share the code with someone who should not collect your order.</p></section>
      <section className="panel"><h2>If plans change</h2><p>Each independent seller sets their own cancellation and refund policy. Check with the seller as soon as possible; a cancellation or refund is not automatic, and The Candy Lady does not enforce a single policy for every shop.</p></section>
      <section className="panel"><h2>If something is wrong</h2><p>Contact the seller first about a missing, incorrect, damaged, or unavailable item. Keep your order details and pickup code handy. If you cannot resolve an order issue with the seller, email <a href="mailto:hello@neighborhoodcandylady.com">hello@neighborhoodcandylady.com</a> with your account email, the shop name, and your pickup code so the marketplace can review what happened.</p></section>
      <section className="panel"><h2>Payment questions</h2><p>Stripe processes card payments. The Candy Lady does not store full card numbers. For more marketplace rules, read the <Link href="/terms">terms of use</Link>; for common questions, visit the <Link href="/faq">FAQ</Link>.</p></section>
    </div>
  );
}
