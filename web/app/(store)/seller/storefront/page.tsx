import type { Metadata } from "next";
import { StorefrontForm } from "@/components/seller/storefront-form";

export const metadata: Metadata = { title: "Shop page" };

export default function SellerStorefrontPage() {
  return <StorefrontForm />;
}
