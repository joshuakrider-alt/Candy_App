import type { Metadata } from "next";
import { IdentityPanel } from "@/components/seller/identity-panel";

export const metadata: Metadata = { title: "ID check" };

export default function SellerVerifyPage() {
  return <IdentityPanel />;
}
