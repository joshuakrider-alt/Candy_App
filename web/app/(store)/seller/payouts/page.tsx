import type { Metadata } from "next";
import { PayoutsPanel } from "@/components/seller/payouts-panel";

export const metadata: Metadata = { title: "Payouts" };

export default function SellerPayoutsPage() {
  return <PayoutsPanel />;
}
