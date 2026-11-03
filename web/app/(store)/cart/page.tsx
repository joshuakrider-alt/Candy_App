import type { Metadata } from "next";
import { CartContents } from "@/components/cart/cart-contents";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-4xl font-extrabold text-cola">Your cart</h1>
      <div className="rounded-lg bg-paper/95 p-5 shadow-candy">
        <CartContents />
      </div>
    </div>
  );
}
