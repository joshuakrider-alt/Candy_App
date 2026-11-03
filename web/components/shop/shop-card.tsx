import Link from "next/link";
import { BadgeCheck, Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ShopLogo } from "@/components/shop/shop-logo";
import { ShopTitle } from "@/components/shop/shop-title";
import type { ShopSummary } from "@/lib/flask";

export function isOpenNow(shop: Pick<ShopSummary, "in_stock_count">) {
  // The old site's rule: a shop with stock on the shelf is open for orders.
  return shop.in_stock_count > 0;
}

export function ShopCard({ shop }: { shop: ShopSummary }) {
  const open = isOpenNow(shop);
  return (
    <Link
      href={shop.storefront_path}
      className="group flex h-full flex-col gap-3 rounded-lg bg-paper/95 p-5 shadow-candy transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <ShopLogo name={shop.shop_name} logoUrl={shop.logo_url} theme={shop.theme} />
        <div className="min-w-0">
          <ShopTitle title={shop.shop_title} className="mb-1" />
          <h3 className="font-heading text-xl leading-tight font-extrabold text-cola group-hover:underline">
            {shop.shop_name}
          </h3>
          {shop.tagline && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{shop.tagline}</p>}
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-cola">
        <li className="flex items-center gap-1.5">
          <MapPin aria-hidden className="size-4 text-ember" /> {shop.neighborhood}
        </li>
        <li className="flex items-center gap-1.5">
          <Clock aria-hidden className="size-4 text-ember" /> {shop.pickup_window}
        </li>
      </ul>
      <div className="mt-auto flex flex-wrap gap-1.5">
        <Badge className={open ? "bg-soda-aqua/30 text-cola" : "bg-muted text-muted-foreground"}>
          {open ? "Open now" : "Restocking"}
        </Badge>
        {open && (
          <Badge variant="outline" className="text-cola">
            {shop.in_stock_count} item{shop.in_stock_count === 1 ? "" : "s"} in stock
          </Badge>
        )}
        {shop.identity_verified && (
          <Badge variant="outline" className="text-cola">
            <BadgeCheck aria-hidden className="text-cherry-deep" /> ID verified
          </Badge>
        )}
        {!shop.accepts_card_payments && (
          <Badge variant="outline" className="text-muted-foreground">
            Card payments not set up yet
          </Badge>
        )}
      </div>
    </Link>
  );
}
