"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Package, ShoppingBag, Store, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/shops", label: "Shops", icon: Store },
  { href: "/cart", label: "Cart", icon: ShoppingBag },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account", label: "Account", icon: UserRound },
] as const;

/** Phone-only bottom navigation, always one thumb away. */
export function TabBar() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || (href !== "/account" && pathname.startsWith(`${href}/`));

  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              // Signed-in pages redirect a signed-out visitor to /login, which
              // a background prefetch cannot follow; load them on tap instead.
              prefetch={href.startsWith("/account") ? false : undefined}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-xs font-bold text-muted-foreground",
                active(href) && "text-cherry-deep",
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
