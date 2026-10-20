import Link from "next/link";
import { CONTACT_EMAIL, FOOTER_COLUMNS } from "@/components/site-links";

export function SiteFooter() {
  return (
    <footer className="mt-16 rounded-t-[26px] bg-cola pt-12 pb-28 text-cream sm:rounded-t-[38px] md:pb-8">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="grid gap-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="font-heading text-2xl font-extrabold text-lemon">
              The Candy Lady
            </Link>
            <p className="mt-1 font-bold">The snack stop you can walk to.</p>
            <p className="mt-2 max-w-sm text-cream/80">
              Neighborhood sellers. Candy, sweets, snacks, and cold drinks. Pay by card, then pick up with your code.
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-2">
              <h2 className="text-lg font-bold text-bubblegum">{column.title}</h2>
              {column.links.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-cream/15 pt-6 text-sm text-cream/80 sm:flex-row sm:justify-between">
          <p>© 2026 The Candy Lady. A neighborhood snack marketplace.</p>
          <p>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            {" · "}
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            {" · "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
