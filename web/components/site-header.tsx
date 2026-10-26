import Link from "next/link";
import { Search } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { CartButton } from "@/components/cart/cart-button";
import { MessagesButton } from "@/components/messages/messages-button";
import { NAV_LINKS } from "@/components/site-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="shrink-0 rounded-full bg-cherry-deep px-4 py-1.5 font-heading text-lg font-extrabold text-white shadow-[0_10px_25px_rgba(255,77,109,0.28)]"
        >
          The Candy Lady
        </Link>

        <form action="/shops" role="search" className="relative hidden flex-1 md:block">
          <label htmlFor="site-search" className="sr-only">
            Search shops and snacks
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder="Search shops and snacks"
            className="h-10 w-full rounded-full border border-input bg-white/90 pr-4 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm font-bold text-cola hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <CartButton />
          <MessagesButton />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
