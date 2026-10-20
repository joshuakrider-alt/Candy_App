"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Camera, ClipboardList, Landmark, Palette, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/seller", label: "Pickup queue", icon: ClipboardList },
  { href: "/seller/inventory", label: "Stock and items", icon: PackageSearch },
  { href: "/seller/storefront", label: "Shop page", icon: Palette },
  { href: "/seller/payouts", label: "Payouts", icon: Landmark },
  { href: "/seller/photos", label: "Photos", icon: Camera },
  { href: "/seller/verify", label: "ID check", icon: BadgeCheck },
] as const;

/** Sidebar on a laptop, a scrolling row of pills on a phone. */
export function SellerNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seller dashboard" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 font-bold whitespace-nowrap text-cola transition-colors hover:bg-white md:rounded-md",
                  active ? "bg-cherry-deep text-white hover:bg-cherry-deep" : "bg-paper/80",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
