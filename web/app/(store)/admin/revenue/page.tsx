import type { Metadata } from "next";
import { RevenuePanel } from "@/components/admin/revenue";

export const metadata: Metadata = { title: "Revenue and refunds" };

export default function AdminRevenuePage() {
  return <RevenuePanel />;
}
