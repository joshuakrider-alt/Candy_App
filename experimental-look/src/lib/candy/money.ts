export const PLATFORM_FEE_PERCENT = 10;
export const STRIPE_PERCENT = 2.9;
export const STRIPE_FLAT_CENTS = 30;
export const STRIPE_CONNECT_PERCENT = 0.25;
export const PAYOUT_BUSINESS_DAYS = 2;

export type MoneySplit = {
  subtotalCents: number;
  applicationFeeCents: number;
  stripeFeeCents: number;
  sellerNetCents: number;
};

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function platformFeeCents(totalCents: number): number {
  return Math.round((totalCents * PLATFORM_FEE_PERCENT) / 100);
}

export function stripeFeeCents(totalCents: number): number {
  return Math.round((totalCents * (STRIPE_PERCENT + STRIPE_CONNECT_PERCENT)) / 100) + STRIPE_FLAT_CENTS;
}

export function splitCharge(subtotalCents: number): MoneySplit {
  const applicationFeeCents = platformFeeCents(subtotalCents);
  const stripe = stripeFeeCents(subtotalCents);
  return {
    subtotalCents,
    applicationFeeCents,
    stripeFeeCents: stripe,
    sellerNetCents: Math.max(0, subtotalCents - applicationFeeCents - stripe),
  };
}

export function stockLabel(count: number): "in-stock" | "low-stock" | "out-of-stock" {
  if (count <= 0) return "out-of-stock";
  if (count <= 4) return "low-stock";
  return "in-stock";
}
