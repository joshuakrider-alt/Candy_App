import type { Metadata } from "next";
import Link from "next/link";

// Ported from the old site's contact.html.
export const metadata: Metadata = {
  title: "Contact",
  description: "Contact The Candy Lady for help with orders, accounts, seller applications, privacy requests, or shop questions.",
};

export default function ContactPage() {
  return (
    <div className="info-page">
      <section className="info-hero"><p className="eyebrow">Contact</p><h1>Write when you need a person.</h1><p className="hero-text">The Candy Lady doesn&apos;t have a shop phone or a public storefront. Email is the way to reach the person who runs the site.</p></section>
      <a className="button-link flex flex-col gap-1 rounded-lg bg-cola p-6 text-cream shadow-candy hover:bg-cola/90" href="mailto:hello@neighborhoodcandylady.com"><span className="text-sm font-bold text-lemon">Email The Candy Lady</span><strong className="font-heading text-2xl break-all">hello@neighborhoodcandylady.com</strong></a>
      <section className="panel"><h2>To help us help you, include:</h2><ul><li>Whether you&apos;re a buyer or a seller.</li><li>The shop name, if you have one.</li><li>Your pickup code, if it&apos;s about an order.</li></ul></section>
      <section className="panel"><h2>Good reasons to write:</h2><ul><li>Help with an account or order.</li><li>A question about a seller application.</li><li>Pausing or closing your shop.</li><li>A privacy or deletion request.</li><li>Something on the site that looks wrong.</li></ul></section>
      <section className="panel"><h2>About pickup</h2><p>Pickup happens at each seller&apos;s shop, not a central counter, so check that shop&apos;s pickup notes first.</p><p>Looking for a quick answer? Visit the <Link href="/faq">FAQ</Link>.</p></section>
    </div>
  );
}
