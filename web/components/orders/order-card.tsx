"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OrderItems } from "@/components/orders/order-summary";
import { STEPS, canFinishPaying, orderStatusLine, stepIndex } from "@/components/orders/order-status";
import { PickupCode } from "@/components/orders/pickup-code";
import { PickupPlace } from "@/components/orders/pickup-place";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ShopTitle } from "@/components/shop/shop-title";

const TONE = {
  wait: "bg-lemon text-cola",
  go: "bg-soda-aqua/40 text-cola",
  ready: "bg-cherry-deep text-white",
  done: "bg-cola text-cream",
  off: "bg-muted text-muted-foreground",
};

export function OrderCard({
  order,
  busy,
  onFinishPaying,
  onRelease,
}: {
  order: Order;
  busy: boolean;
  onFinishPaying: () => void;
  onRelease: () => void;
}) {
  const line = orderStatusLine(order);
  const step = stepIndex(order);
  const placed = order.created_at ? new Date(`${order.created_at}Z`) : null;
  return (
    <article className="flex flex-col gap-4 rounded-lg bg-paper/95 p-5 shadow-candy">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <ShopTitle title={order.seller?.shop_title} className="mb-1" />
          <h2 className="font-heading text-xl font-extrabold text-cola">
            {order.seller?.slug ? (
              <Link href={`/s/${order.seller.slug}`} className="hover:underline">
                {order.seller.shop_name}
              </Link>
            ) : (
              (order.seller?.shop_name ?? "Shop")
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            Order #{order.id}
            {placed && ` · ${placed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-extrabold", TONE[line.tone])}>{line.label}</span>
      </header>

      {step !== null && step !== undefined && (
        <ol aria-label="Order progress" className="grid grid-cols-4 gap-1 text-center text-xs font-bold">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined}>
              <span className={cn("mb-1 block h-1.5 rounded-full", i <= step ? "bg-cherry-deep" : "bg-muted")} />
              <span className={i <= step ? "text-cola" : "text-muted-foreground"}>{label}</span>
            </li>
          ))}
        </ol>
      )}

      {order.pickup_code && order.status !== "completed" && <PickupCode code={order.pickup_code} size="sm" />}
      {order.status === "ready" && order.seller && (
        <p className="text-sm font-bold text-cola">
          Ready at {order.seller.shop_name}, {order.seller.pickup_window}.
        </p>
      )}
      {/* The street address only arrives once the order is paid. */}
      {order.pickup_code && order.status !== "completed" && <PickupPlace order={order} className="p-3" showTitle={false} />}

      <OrderItems order={order} />

      {(order.pickup_code ||
        order.payment_status === "paid" ||
        order.payment_status === "pay_at_pickup" ||
        order.payment_status === "refunded") && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {order.pickup_code && (
            <Link href={`/account/orders/${order.id}`} className="text-sm font-bold text-cherry-deep underline">
              View receipt
            </Link>
          )}
          {(order.payment_status === "paid" || order.payment_status === "pay_at_pickup" || order.payment_status === "refunded") && (
            <Link
              href={`/account/messages/new?order=${order.id}`}
              prefetch={false}
              className="text-sm font-bold text-cherry-deep underline"
            >
              Message the shop
            </Link>
          )}
        </div>
      )}

      {canFinishPaying(order) && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onFinishPaying} disabled={busy} className="rounded-full font-extrabold">
            Finish paying
          </Button>
          <Button onClick={onRelease} disabled={busy} variant="outline" className="rounded-full font-extrabold">
            Release items
          </Button>
        </div>
      )}
    </article>
  );
}
