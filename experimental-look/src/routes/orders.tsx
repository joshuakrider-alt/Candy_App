import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listMyOrders } from "@/lib/candy/server";
import { formatCents } from "@/lib/candy/money";
import type { OrderView } from "@/lib/candy/types";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

function statusVariant(status: OrderView["status"]) {
  if (status === "ready" || status === "completed") return "mint" as const;
  if (status === "packing") return "cream" as const;
  return "paper" as const;
}

function OrdersPage() {
  const { user, isPending } = useCurrentUserState();
  const [orders, setOrders] = useState<OrderView[] | null>(null);

  useEffect(() => {
    if (!user) return;
    void listMyOrders()
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [user]);

  if (isPending) return <Skeleton className="h-40" />;
  if (!user) return <RedirectToSignIn />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
          Pickup
        </p>
        <h1 className="font-display text-4xl font-extrabold">Your orders.</h1>
      </header>
      {!orders ? (
        <Skeleton className="h-40" />
      ) : orders.length === 0 ? (
        <div className="rounded-[22px] bg-paper p-6 shadow-[var(--shadow-card)]">
          <p className="font-bold">No orders yet.</p>
          <Link to="/shop" className="mt-3 inline-block font-bold text-cherry">
            Shop a snack spot
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl font-extrabold">{order.shopName}</p>
                  <p className="text-sm text-muted">{order.neighborhood}</p>
                </div>
                <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
              </div>
              {order.pickupCode ? (
                <p className="mt-4 rounded-[16px] bg-foam px-4 py-3 font-display text-3xl font-extrabold tracking-[0.12em]">
                  {order.pickupCode}
                </p>
              ) : null}
              <ul className="mt-3 grid gap-1 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <span className="tabular-nums">
                      {formatCents(item.unitPriceCents * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm font-extrabold tabular-nums">
                Paid {formatCents(order.totalCents)} to {order.shopName}
              </p>
              <p className="mt-1 text-xs text-muted">
                Direct Charge · seller keeps {formatCents(order.sellerPayoutCents)} after fees
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
