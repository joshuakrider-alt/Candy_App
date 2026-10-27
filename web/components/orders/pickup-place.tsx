import { Clock, DoorOpen, MapPin } from "lucide-react";
import { ShopTitle } from "@/components/shop/shop-title";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Where and when to collect a paid order. Flask only sends `order.pickup` once
 * the order is paid, so before that (or for a shop that has not filled its
 * address in yet) this falls back to the public neighborhood.
 */
export function PickupPlace({
  order,
  className,
  showTitle = true,
}: {
  order: Order;
  className?: string;
  /** Off where the shop's title is already shown just above, as on order cards. */
  showTitle?: boolean;
}) {
  const { seller, pickup } = order;
  if (!seller) return null;
  return (
    <div className={cn("flex flex-col gap-1 rounded-md bg-muted p-4 text-cola", className)}>
      {showTitle && <ShopTitle title={seller.shop_title} className="self-start" />}
      <p className="font-heading text-xl font-bold">{seller.shop_name}</p>
      {pickup ? (
        <p className="flex items-start gap-1.5 text-sm font-bold">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-line" data-testid="pickup-address">
            {pickup.address}
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm">
          <MapPin aria-hidden className="size-4 shrink-0" /> {seller.neighborhood}
        </p>
      )}
      {pickup?.note && (
        <p className="flex items-start gap-1.5 text-sm">
          <DoorOpen aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-line">{pickup.note}</span>
        </p>
      )}
      <p className="flex items-center gap-1.5 text-sm">
        <Clock aria-hidden className="size-4 shrink-0" /> {seller.pickup_window}
      </p>
      {!pickup && order.pickup_code && (
        <p className="text-sm text-muted-foreground">
          The shop hasn&apos;t added its street address yet. It will show here in your orders as soon as they do.
        </p>
      )}
    </div>
  );
}
