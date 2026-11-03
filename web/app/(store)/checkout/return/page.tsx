import type { Metadata } from "next";
import { CheckoutReturn } from "@/components/orders/checkout-return";

// Per request: it carries the nonce policy (see middleware.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

type Props = { searchParams: Promise<{ order?: string; session_id?: string; payment?: string; shop?: string }> };

export default async function CheckoutReturnPage({ searchParams }: Props) {
  const { order, session_id, payment, shop } = await searchParams;
  return <CheckoutReturn params={{ order, session_id, payment, shop }} />;
}
