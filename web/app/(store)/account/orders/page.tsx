import type { Metadata } from "next";
import { OrderList } from "@/components/orders/order-list";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default function OrdersPage() {
  return (
    <>
      <h1 className="text-4xl font-extrabold text-cola">Your orders</h1>
      <OrderList />
    </>
  );
}
