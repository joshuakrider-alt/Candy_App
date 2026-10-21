"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderItems } from "@/components/orders/order-summary";
import { PickupCode } from "@/components/orders/pickup-code";
import { Panel } from "@/components/seller/panel";
import { errorText, usePublicConfig, useSellerId } from "@/components/seller/seller-shop";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { OrderStatus, PublicConfig, SellerOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  new: { status: "packing", label: "Start packing" },
  packing: { status: "ready", label: "Mark ready" },
  ready: { status: "completed", label: "Picked up" },
};

const PILL: Record<OrderStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-lemon text-cola" },
  packing: { label: "Packing", tone: "bg-soda-aqua/40 text-cola" },
  ready: { label: "Ready", tone: "bg-cherry-deep text-white" },
  completed: { label: "Picked up", tone: "bg-cola text-cream" },
};

function paidLabel(order: SellerOrder) {
  if (order.payment_status !== "paid") return "Pay at pickup (old order)";
  return order.payout_method === "connect" ? "Paid by card · Stripe pays you" : "Paid by card";
}

function feeNote(config: PublicConfig | undefined) {
  if (!config) return null;
  const parts = [];
  if (config.platform_fee_percent) parts.push(`${config.platform_fee_percent}%`);
  if (config.platform_fee_flat_cents) parts.push(money(config.platform_fee_flat_cents));
  return parts.length ? `${parts.join(" + ")} platform fee per order` : "No platform fee";
}

/** Paid orders waiting for pickup, oldest first, refreshed every 30 seconds. */
export function PickupQueue() {
  const sellerId = useSellerId();
  const client = useQueryClient();
  const { data: config } = usePublicConfig();
  const key = ["seller-orders", sellerId];
  const { data: orders, error, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api.get<SellerOrder[]>(`/sellers/${sellerId}/orders`),
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState<number | null>(null);

  async function advance(order: SellerOrder) {
    const next = NEXT[order.status];
    if (!next) return;
    setBusy(order.id);
    try {
      await api.put(`/orders/${order.id}/status`, { status: next.status });
      toast.success(next.status === "completed" ? `Order #${order.id} picked up.` : `Order #${order.id}: ${PILL[next.status].label}.`);
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const payout = (orders ?? []).reduce((sum, o) => sum + o.seller_payout_cents, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-paper/95 p-4 shadow-candy">
          <p className="text-sm font-bold text-muted-foreground">Waiting for pickup</p>
          <p className="font-heading text-3xl font-extrabold text-cola">{orders ? orders.length : "–"}</p>
        </div>
        <div className="rounded-lg bg-paper/95 p-4 shadow-candy">
          <p className="text-sm font-bold text-muted-foreground">You keep</p>
          <p className="font-heading text-3xl font-extrabold text-cola">{orders ? money(payout) : "–"}</p>
          {feeNote(config) && <p className="text-xs text-muted-foreground">{feeNote(config)}</p>}
        </div>
      </div>

      <Panel title="Pickup queue" description="Check the buyer's pickup code before you hand anything over.">
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="font-bold text-destructive">
            {errorText(error, "Could not load your orders.")}
          </p>
        ) : !orders.length ? (
          <p className="text-muted-foreground">No paid orders waiting. New ones show up here on their own.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {orders.map((order) => {
              const next = NEXT[order.status];
              return (
                <li key={order.id} aria-label={`Order #${order.id}`} className="flex flex-col gap-3 rounded-md border border-border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-xl font-extrabold text-cola">Order #{order.id}</h3>
                    <span className={cn("rounded-full px-3 py-1 text-sm font-extrabold", PILL[order.status].tone)}>
                      {PILL[order.status].label}
                    </span>
                  </div>
                  {order.pickup_code && <PickupCode code={order.pickup_code} size="sm" />}
                  <p className="text-sm text-cola">
                    <strong>{order.buyer_name}</strong> · {paidLabel(order)} · you keep {money(order.seller_payout_cents)}
                  </p>
                  <OrderItems order={order} />
                  {next && (
                    <Button
                      onClick={() => advance(order)}
                      disabled={busy === order.id}
                      className="self-start rounded-full px-6 font-extrabold"
                    >
                      {next.label}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
