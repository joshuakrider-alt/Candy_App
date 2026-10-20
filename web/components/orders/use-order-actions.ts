"use client";

import { ApiRequestError, api } from "@/lib/api";
import type { Order } from "@/lib/types";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * "Finish paying": reopens the same Stripe page (POST /orders/<id>/checkout).
 * Right after an order is placed Flask may still be attaching its Stripe
 * session and answers 409 "still opening"; that is retried once after 2 s.
 * Returns the order when it turned out to be paid already.
 */
export async function finishPaying(orderId: number, returnTo: "shop" | "marketplace") {
  const attempt = () => api.post<Order>(`/orders/${orderId}/checkout`, { return_to: returnTo });
  let order: Order;
  try {
    order = await attempt();
  } catch (error) {
    if (!(error instanceof ApiRequestError && error.status === 409)) throw error;
    await wait(2000);
    order = await attempt();
  }
  if (order.checkout_url) {
    window.location.assign(order.checkout_url);
    return null;
  }
  return order;
}

/** "Release items": cancels an unpaid order and puts its stock back. */
export function releaseItems(orderId: number) {
  return api.post<Order>(`/orders/${orderId}/cancel`);
}

export function sentence(message: string) {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
