import type { Metadata } from "next";
import { PickupQueue } from "@/components/seller/pickup-queue";

export const metadata: Metadata = { title: "Pickup queue" };

export default function SellerQueuePage() {
  return <PickupQueue />;
}
