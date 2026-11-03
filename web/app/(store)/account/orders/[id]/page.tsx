import type { Metadata } from "next";
import { OrderReceipt } from "@/components/orders/order-receipt";

export const metadata: Metadata = { title: "Receipt", robots: { index: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderReceipt orderId={Number(id)} />;
}
