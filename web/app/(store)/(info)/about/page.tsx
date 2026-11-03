import type { Metadata } from "next";
import Link from "next/link";

// Ported from the old site's about.html.
export const metadata: Metadata = {
  title: "About",
  description: "The story behind The Candy Lady, a neighborhood marketplace for local sweets, snacks, drinks, and pickup orders.",
};

export default function AboutPage() {
  return (
    <div className="info-page">
      <section className="info-hero"> <p className="eyebrow">About us</p> <h1>The house you walked to after school.</h1> <p className="hero-text">Before every snack lived in an app, a lot of neighborhoods had a candy lady. Not a chain. A person. The house you walked to after school with whatever was in your pocket.</p> </section>
      <section className="panel"><h2>The memory</h2><p>That stop was simple. You knew the street. You knew what she carried. You didn&apos;t need a speech about community. You needed a cold drink and something sweet before you headed home. That memory is why this site exists: a marketplace that keeps the part people actually miss, a nearby sweets spot run by someone on your block.</p></section>
      <section className="panel"><h2>What this is</h2><p>The Candy Lady is a neighborhood candy and snack marketplace. Buyers shop candy, sweets, snacks, and drinks from local home-based sellers. You pay by card when you order and collect your bag with a pickup code. There&apos;s no delivery.</p><p>Sellers aren&apos;t random listings. A neighbor applies, the shop is reviewed, and it goes live only after approval. Each seller chooses what they carry, anything sweets-related, and sets their own prices. Sellers mark orders packing, ready, and complete so you know when to walk over.</p></section>
      <section className="panel"><h2>Who it&apos;s for</h2><p>If you want something sweet close to home, this is the shop window. If you already run a little candy setup, or you&apos;ve always wanted to, this is the front door. Apply, get approved, stock your shop, and take pickup orders.</p></section>
      <section className="panel"><h2>Who runs it</h2><p>The Candy Lady is a sole proprietorship operating <strong>neighborhoodcandylady.com</strong>. It&apos;s an online neighborhood marketplace, not a walk-in candy store, and it isn&apos;t connected to other businesses that share the name. Questions: <a href="mailto:hello@neighborhoodcandylady.com">hello@neighborhoodcandylady.com</a>. You can also <Link href="/contact">visit the contact page</Link>.</p></section>
      <blockquote>Same walk. Same bag. A pickup code instead of rummaging for ones.</blockquote>
    </div>
  );
}
