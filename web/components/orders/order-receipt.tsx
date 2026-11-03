"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderItems } from "@/components/orders/order-summary";
import { orderStatusLine } from "@/components/orders/order-status";
import { PickupCode } from "@/components/orders/pickup-code";
import { PickupPlace } from "@/components/orders/pickup-place";
import { sentence } from "@/components/orders/use-order-actions";
import { ApiRequestError, api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Order } from "@/lib/types";

const when = (iso: string | null) =>
  iso
    ? new Date(`${iso}Z`).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

/** One order as a receipt, from GET /orders/<id>. Only a paid order has one. */
export function OrderReceipt({ orderId }: { orderId: number }) {
  const valid = Number.isInteger(orderId) && orderId > 0;
  const order = useQuery({
    queryKey: ["orders", orderId],
    queryFn: () => api.get<Order>(`/orders/${orderId}`),
    enabled: valid,
  });

  const back = (
    <Link href="/account/orders" className="font-bold text-cherry-deep underline print:hidden">
      Back to your orders
    </Link>
  );

  if (!valid || order.isError) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-paper/95 p-6 shadow-candy">
        <p role="alert">
          {!valid
            ? "This link is missing its order number."
            : order.error instanceof ApiRequestError
              ? sentence(order.error.message)
              : "Could not load this order."}
        </p>
        {back}
      </div>
    );
  }
  if (order.isPending) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  const data = order.data;
  if (!data.pickup_code) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-paper/95 p-6 shadow-candy">
        <h1 className="text-3xl font-extrabold text-cola">No receipt for order #{data.id}</h1>
        <p>{orderStatusLine(data).label}. A receipt is only issued once an order is paid.</p>
        {back}
      </div>
    );
  }

  const refunded = data.refunded_cents > 0;
  return (
    <article className="flex flex-col gap-5 rounded-xl bg-paper/95 p-6 shadow-candy sm:p-8 print:bg-white print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-[0.12em] text-ember uppercase">Receipt</p>
          <h1 className="mt-1 text-3xl font-extrabold text-cola">Order #{data.id}</h1>
          <p className="text-sm text-muted-foreground">
            {data.paid_at ? `Paid ${when(data.paid_at)}` : `Placed ${when(data.created_at)}`} · {orderStatusLine(data).label}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="rounded-full font-bold print:hidden">
          <Printer aria-hidden className="size-4" /> Print
        </Button>
      </header>

      {data.status !== "completed" && <PickupCode code={data.pickup_code} size="sm" />}
      <PickupPlace order={data} />
      <OrderItems order={data} />
      {refunded && (
        <p className="flex justify-between text-sm font-bold text-cola">
          <span>Refunded</span>
          <span className="tabular-nums">−{money(data.refunded_cents)}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {data.payment_status === "pay_at_pickup" ? "Pay the shop when you collect it." : "Paid by card through Stripe."} Show the
        pickup code to the shop when you collect your order.
      </p>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Link href="/account/orders" className={buttonVariants({ variant: "outline", className: "rounded-full font-extrabold" })}>
          Back to your orders
        </Link>
      </div>
    </article>
  );
}
