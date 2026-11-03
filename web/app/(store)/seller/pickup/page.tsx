import type { Metadata } from "next";
import { PickupDetailsForm } from "@/components/seller/pickup-details-form";

export const metadata: Metadata = { title: "Pickup details" };

export default function SellerPickupPage() {
  return <PickupDetailsForm />;
}
