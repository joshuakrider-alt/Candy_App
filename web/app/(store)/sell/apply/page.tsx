import type { Metadata } from "next";
import { ApplyForm } from "@/components/seller/apply-form";

export const metadata: Metadata = {
  title: "Apply to sell",
  description: "Run a neighborhood snack spot: apply, set up your shelf, and get paid by card through Stripe.",
};

// Rendered per request so the Content Security Policy nonce reaches every
// script on a page that takes a password (see middleware.ts).
export const dynamic = "force-dynamic";

export default function ApplyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="font-bold text-cherry-deep">Sell on The Candy Lady</p>
        <h1 className="text-4xl font-extrabold text-cola">Apply to run a neighborhood snack spot</h1>
        <p className="mt-2 text-lg text-cola">
          Tell us about your shop and pick a password. You can sign in straight away and set up your shelf; buyers see
          your shop once we approve it.
        </p>
      </div>
      <ApplyForm />
    </div>
  );
}
