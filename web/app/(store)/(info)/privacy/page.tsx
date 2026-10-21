import type { Metadata } from "next";

// Ported from the old site's privacy.html.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How The Candy Lady collects, uses, and protects buyer and seller information.",
};

export default function PrivacyPage() {
  return (
    <div className="info-page">
      <section className="info-hero"> <p className="eyebrow">Privacy policy</p> <h1>Your information, in plain language.</h1> <p className="hero-text"> This policy explains how The Candy Lady handles information when you use our neighborhood candy and snack marketplace for pickup orders. </p> <p className="hero-text"><strong>Last updated: September 11, 2026</strong></p> </section>
      <section className="panel"> <h2>Who we are</h2> <p> The Candy Lady is a sole proprietorship operating <strong>neighborhoodcandylady.com</strong> and <strong>api.neighborhoodcandylady.com</strong>. For privacy questions or requests, email <a href="mailto:hello@neighborhoodcandylady.com">hello@neighborhoodcandylady.com</a>. </p> </section>
      <section className="panel"> <h2>What we collect</h2> <ul> <li>Account information, such as your name, email address, and role.</li> <li>Seller application information and shop details.</li> <li>Order, pickup, and payment-status details needed to complete an order.</li> <li>Basic device and browser information, plus Vercel Analytics data.</li> <li>When offered, product photos and seller shop portraits stored in object storage.</li> </ul> </section>
      <section className="panel"> <h2>Payments and identity checks</h2> <p> Card payments are handled by Stripe. We do not store full card numbers. If a seller chooses or is asked to complete Stripe Identity verification, Stripe keeps the ID and selfie images; we keep only the verification status and session ID needed to manage the seller account. </p> </section>
      <section className="panel"> <h2>How we use and share information</h2> <p> We use information to run the marketplace, process pickup orders, review seller applications, protect the service, and improve the site. We share information only as needed with service providers that help us operate it: Stripe, Vercel, Render, and our Neon/Postgres hosting provider. </p> </section>
      <section className="panel"> <h2>Children and families</h2> <p> Families may use the marketplace. We do not knowingly sell children’s personal information. If you believe a child has provided personal information without appropriate permission, contact us and we will review it. </p> </section>
      <section className="panel"> <h2>Retention and security</h2> <p> We keep information for as long as reasonably needed to provide the service, meet legal or accounting needs, resolve disputes, and keep records secure. We use reasonable technical and organizational safeguards, but no online service can guarantee absolute security. </p> </section>
      <section className="panel"> <h2>Your choices and account deletion</h2> <p> You can ask to access, correct, or delete your personal information. Where available, you can delete your account in the app using <strong>DELETE /me</strong>. You can also email <a href="mailto:hello@neighborhoodcandylady.com">hello@neighborhoodcandylady.com</a> with your request. Some information may be retained when required for legal, security, or transaction-record purposes. </p> </section>
      <section className="panel"> <h2>Contact us</h2> <p> Questions about this policy or your information? Email <a href="mailto:hello@neighborhoodcandylady.com">hello@neighborhoodcandylady.com</a>. </p> </section>
    </div>
  );
}
