"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderCard } from "@/components/orders/order-card";
import { finishPaying, releaseItems, sentence } from "@/components/orders/use-order-actions";
import { ApiRequestError, api } from "@/lib/api";
import type { Order } from "@/lib/types";

/** Your orders, from GET /me/orders; refreshed every 30 s so "Ready" shows up. */
export function OrderList() {
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const orders = useQuery({
    queryKey: ["me", "orders"],
    queryFn: () => api.get<Order[]>("/me/orders"),
    refetchInterval: 30_000,
  });

  async function run(order: Order, action: () => Promise<unknown>) {
    setBusyId(order.id);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["me", "orders"] });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? sentence(error.message) : "Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (orders.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }
  if (orders.isError) {
    return (
      <p role="alert" className="rounded-lg bg-paper/95 p-6 shadow-candy">
        {orders.error instanceof ApiRequestError ? sentence(orders.error.message) : "Could not load your orders."}
      </p>
    );
  }
  if (!orders.data.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-paper/95 p-8 text-center shadow-candy">
        <p className="font-heading text-xl font-bold text-cola">No orders yet.</p>
        <Link href="/shops" className={buttonVariants({ className: "rounded-full font-extrabold" })}>
          Browse shops
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {orders.data.map((order) => (
        <li key={order.id}>
          <OrderCard
            order={order}
            busy={busyId === order.id}
            onFinishPaying={() => run(order, () => finishPaying(order.id, "marketplace"))}
            onRelease={() => run(order, () => releaseItems(order.id))}
          />
        </li>
      ))}
    </ul>
  );
}
