"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  BookOpen,
  Camera,
  ClipboardList,
  Images,
  Landmark,
  MessageCircle,
  Palette,
  PackageSearch,
  Receipt,
  Store,
} from "lucide-react";
import { badgeText, useUnreadCount } from "@/components/messages/use-unread";
import { cn } from "@/lib/utils";

const LINKS = {
  seller: [
    { href: "/seller", label: "Pickup queue", icon: ClipboardList },
    { href: "/seller/inventory", label: "Stock and items", icon: PackageSearch },
    { href: "/seller/storefront", label: "Shop page", icon: Palette },
    { href: "/seller/payouts", label: "Payouts", icon: Landmark },
    { href: "/seller/photos", label: "Photos", icon: Camera },
    { href: "/seller/verify", label: "ID check", icon: BadgeCheck },
    { href: "/account/messages", label: "Messages", icon: MessageCircle },
  ],
  admin: [
    { href: "/admin", label: "Applications", icon: Store },
    { href: "/admin/revenue", label: "Revenue and refunds", icon: Receipt },
    { href: "/admin/catalog", label: "Catalog", icon: BookOpen },
    { href: "/admin/photos", label: "Photo review", icon: Images },
    { href: "/admin/messages", label: "Support inbox", icon: MessageCircle },
  ],
} as const;

/** The seller or admin menu: a sidebar on a laptop, a scrolling row of pills on a phone. */
export function DashboardNav({ area }: { area: keyof typeof LINKS }) {
  const pathname = usePathname();
  const unread = useUnreadCount();
  return (
    <nav aria-label={area === "seller" ? "Seller dashboard" : "Admin"} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col">
        {LINKS[area].map(({ href, label, icon: Icon }) => {
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
                {Icon === MessageCircle && unread > 0 && (
                  <span className="ml-auto rounded-full bg-lemon px-2 text-xs font-extrabold text-cola">{badgeText(unread)}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
