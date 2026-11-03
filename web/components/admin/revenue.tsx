"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import { money } from "@/lib/format";
import type { Order, PaymentStatus, Revenue } from "@/lib/types";

const PAYMENT: Record<PaymentStatus, string> = {
  unpaid: "Not paid",
  pending: "Paying",
  paid: "Paid",
  pay_at_pickup: "Pay at pickup",
  expired: "Expired",
  refunded: "Refunded",
};

const when = (iso: string | null) =>
  iso ? new Date(`${iso}Z`).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function Totals({ revenue }: { revenue: Revenue }) {
  const fee = [
    revenue.platform_fee_percent ? `${revenue.platform_fee_percent}%` : null,
    revenue.platform_fee_flat_cents ? money(revenue.platform_fee_flat_cents) : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const rows: [string, string][] = [
    ["Paid orders", String(revenue.paid_order_count)],
    ["Collected", money(revenue.gross_cents)],
    ["Partly refunded", money(revenue.partially_refunded_cents)],
    ["Platform fee earned", money(revenue.platform_fee_cents)],
    ["Paid out by Stripe", money(revenue.connect_seller_payout_cents)],
    ["Still owed to sellers (before Connect)", money(revenue.seller_payout_owed_cents)],
    ["Fee rate", fee || "None"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-paper/95 p-4 shadow-candy">
          <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
          <dd className="font-heading text-2xl font-extrabold text-cola">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Totals from GET /admin/revenue, the latest 200 orders, and a refund with a confirmation step. */
export function RevenuePanel() {
  const client = useQueryClient();
  const revenue = useQuery({ queryKey: ["admin-revenue"], queryFn: () => api.get<Revenue>("/admin/revenue") });
  const orders = useQuery({ queryKey: ["admin-orders"], queryFn: () => api.get<Order[]>("/orders") });
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  async function refund() {
    if (!refunding) return;
    setBusy(true);
    try {
      await api.post(`/admin/orders/${refunding.id}/refund`);
      toast.success(`Order #${refunding.id} refunded.`);
      setRefunding(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-orders"] }),
        client.invalidateQueries({ queryKey: ["admin-revenue"] }),
      ]);
    } catch (e) {
      toast.error(errorText(e, "That refund did not go through."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {revenue.data ? (
        <Totals revenue={revenue.data} />
      ) : revenue.error ? (
        <p role="alert" className="font-bold text-destructive">
          {errorText(revenue.error, "Could not load revenue.")}
        </p>
      ) : (
        <Skeleton className="h-40 w-full" />
      )}

      <Panel title="Recent orders" description="The latest 200, newest first.">
        {orders.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : orders.error ? (
          <p role="alert" className="font-bold text-destructive">
            {errorText(orders.error, "Could not load orders.")}
          </p>
        ) : !orders.data.length ? (
          <p className="text-muted-foreground">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm text-cola">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Shop</th>
                  <th className="py-2 pr-3">Placed</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3">Payment</th>
                  <th className="py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.data.map((order) => (
                  <tr key={order.id} aria-label={`Order #${order.id}`}>
                    <td className="py-2 pr-3 font-bold">#{order.id}</td>
                    <td className="py-2 pr-3">{order.seller?.shop_name ?? "–"}</td>
                    <td className="py-2 pr-3">{when(order.created_at)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(order.total_cents)}</td>
                    <td className="py-2 pr-3">{PAYMENT[order.payment_status] ?? order.payment_status}</td>
                    <td className="py-2 text-right">
                      {order.payment_status === "paid" && (
                        <Button variant="outline" size="sm" onClick={() => setRefunding(order)} className="rounded-full font-bold">
                          Refund
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={!!refunding} onOpenChange={(open) => !open && !busy && setRefunding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl text-cola">Refund order #{refunding?.id}?</DialogTitle>
            <DialogDescription>
              The buyer gets {refunding ? money(refunding.total_cents) : ""} back on their card and the order leaves{" "}
              {refunding?.seller?.shop_name ?? "the shop"}&apos;s pickup queue. Stripe takes the shop&apos;s share back.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefunding(null)} className="rounded-full">
              Go back
            </Button>
            <Button variant="destructive" onClick={refund} disabled={busy} className="rounded-full font-extrabold">
              Refund {refunding ? money(refunding.total_cents) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
