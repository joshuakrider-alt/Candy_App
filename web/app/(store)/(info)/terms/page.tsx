import type { Metadata } from "next";
import Link from "next/link";

// Ported from the old site's terms.html.
export const metadata: Metadata = {
  title: "Terms",
  description: "Plain-language terms for using The Candy Lady neighborhood pickup marketplace.",
};

export default function TermsPage() {
  return (
    <div className="info-page">
      <section className="info-hero"><p className="eyebrow">Terms of use</p><h1>Marketplace terms, without the sugarcoating.</h1><p className="hero-text">These terms explain the ground rules for buyers, sellers, and visitors using The Candy Lady.</p><p className="hero-text"><strong>Last updated: September 25, 2026</strong></p></section>
      <section className="panel"><h2>The marketplace</h2><p>The Candy Lady is an online marketplace that connects buyers with independent neighborhood sellers. The Candy Lady is not the seller of the products listed by those sellers and does not operate a public storefront. Orders are for pickup only; delivery is not offered.</p></section>
      <section className="panel"><h2>Using the site</h2><p>Provide accurate information, keep your sign-in details secure, and use the site only for lawful purposes. You are responsible for activity under your account. We may restrict or close accounts that misuse the marketplace, interfere with the site, or put other people at risk.</p></section>
      <section className="panel"><h2>Orders and payment</h2><p>Sellers choose their products, prices, availability, pickup hours, and pickup instructions. Buyers pay by card at checkout through Stripe. An order is with the seller whose shop accepted it. Product photos and descriptions should help you choose, but handmade or independently stocked items may vary.</p></section>
      <section className="panel"><h2>Pickup, cancellations, and refunds</h2><p>Collect orders from the seller shown on the order and follow that seller&apos;s pickup instructions. Each seller sets their own cancellation and refund policy; The Candy Lady does not impose one policy on every shop. Contact the seller about an order first, and see our <Link href="/pickup">pickup and refunds guide</Link> for practical steps.</p></section>
      <section className="panel"><h2>Seller responsibilities</h2><p>Sellers are responsible for keeping listings, prices, stock, pickup details, and required permits or disclosures accurate. Sellers must provide products safely and comply with laws that apply to their products and business. Approval to list on the marketplace is not a guarantee or endorsement of a seller or product.</p></section>
      <section className="panel"><h2>Service availability</h2><p>We work to keep the marketplace available, but we cannot promise uninterrupted access or that every listing will always be available. We may update, suspend, or discontinue parts of the service when reasonably necessary.</p></section>
      <section className="panel"><h2>Privacy and questions</h2><p>Our <Link href="/privacy">privacy policy</Link> explains how information is handled. Questions about these terms can be sent to <a href="mailto:hello@neighborhoodcandylady.com">hello@neighborhoodcandylady.com</a>.</p></section>
    </div>
  );
}
