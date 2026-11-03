"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSellerShop } from "@/components/seller/seller-shop";

/** Asks shops that applied before pickup addresses existed to add theirs. */
export function PickupDetailsPrompt() {
  const seller = useSellerShop();
  const pathname = usePathname();
  if (seller.pickup_address || pathname === "/seller/pickup") return null;
  return (
    <p role="status" className="rounded-lg bg-lemon/70 p-4 font-bold text-cola">
      Buyers can&apos;t see where to collect their orders yet.{" "}
      <Link href="/seller/pickup" className="text-cherry-deep underline">
        Add your pickup address
      </Link>{" "}
      so it shows on their receipt once they pay. It stays off your public shop page.
    </p>
  );
}
