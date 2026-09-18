import { Link } from "@tanstack/react-router";
import { MapPin, Clock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ShopCard as ShopCardType } from "@/lib/candy/types";

export function ShopCard({ shop }: { shop: ShopCardType }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-card)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-foam">
        {shop.photoPath ? (
          <img
            src={shop.photoPath}
            alt=""
            className="media size-full object-cover"
          />
        ) : (
          <div className="size-full bg-foam" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
              {shop.neighborhood}
            </p>
            <h3 className="mt-1 font-display text-2xl font-extrabold leading-none">{shop.shopName}</h3>
          </div>
          {shop.identityVerified ? (
            <Badge variant="mint">
              <ShieldCheck className="mr-1 size-3.5" />
              Verified
            </Badge>
          ) : null}
        </div>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Clock className="size-4 shrink-0" />
          {shop.pickupWindow}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted">
          <MapPin className="size-4 shrink-0" />
          {shop.inStockCount} in-stock items
          {shop.chargesEnabled ? " · paid to seller" : ""}
        </p>
        <Button asChild className="mt-auto">
          <Link to="/shop/$shopId" params={{ shopId: String(shop.id) }}>
            Shop this spot
          </Link>
        </Button>
      </div>
    </article>
  );
}
