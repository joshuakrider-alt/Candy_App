import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { House, ShoppingBag, ClipboardList, Store, UserRound, Flag } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCart, cartCount } from "@/lib/candy/cart";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: House },
  { to: "/shop", label: "Shop", icon: Store },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/sell", label: "Sell", icon: ShoppingBag },
] as const;

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-foam" />;
  }
  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex min-h-11 items-center rounded-full bg-cola px-4 text-sm font-bold text-cream"
      >
        Sign in
      </Link>
    );
  }
  return <UserButton />;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = useCart((s) => s.items);
  const count = cartCount(items);

  return (
    <div className="min-h-dvh bg-cream text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/8 bg-cream/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="font-display text-xl font-extrabold tracking-tight text-cherry">
            The Candy Lady
          </Link>
          <nav className="ml-4 hidden items-center gap-5 text-sm font-bold md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "opacity-70 transition-opacity hover:opacity-100",
                  pathname === item.to && "opacity-100",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/launch"
              className={cn("opacity-70 hover:opacity-100", pathname === "/launch" && "opacity-100")}
            >
              Launch
            </Link>
            <Link to="/apply" className="opacity-70 hover:opacity-100">
              Apply
            </Link>
            <Link to="/admin" className="opacity-70 hover:opacity-100">
              Admin
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/launch"
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-extrabold uppercase tracking-wide md:hidden",
                pathname === "/launch" ? "bg-cola text-cream" : "bg-paper shadow-[var(--shadow-card)]",
              )}
            >
              <Flag className="size-3.5" />
              HQ
            </Link>
            <Link
              to="/cart"
              className="relative inline-flex size-11 items-center justify-center rounded-full bg-paper shadow-[var(--shadow-card)]"
              aria-label="Cart"
            >
              <ShoppingBag className="size-5" />
              {count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-cherry px-1 text-[10px] font-extrabold text-cream">
                  {count}
                </span>
              ) : null}
            </Link>
            <Link
              to="/login"
              className="relative inline-flex size-11 items-center justify-center rounded-full bg-paper shadow-[var(--shadow-card)] sm:hidden"
              aria-label="Account"
            >
              <UserRound className="size-5" />
            </Link>
            <div className="hidden sm:block">
              <AuthSlot />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:pb-16">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink/8 bg-cream/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur-md md:hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-bold",
                active ? "text-cherry" : "text-muted",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <SignedOut>
        <span className="sr-only">Signed out</span>
      </SignedOut>
      <SignedIn>
        <span className="sr-only">Signed in</span>
      </SignedIn>
    </div>
  );
}
