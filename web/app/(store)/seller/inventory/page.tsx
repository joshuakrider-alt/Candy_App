import type { Metadata } from "next";
import { InventoryManager } from "@/components/seller/inventory-manager";

export const metadata: Metadata = { title: "Stock and items" };

export default function SellerInventoryPage() {
  return <InventoryManager />;
}
