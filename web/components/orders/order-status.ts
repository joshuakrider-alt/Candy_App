import type { Order } from "@/lib/types";

/** One line a buyer understands, from the order's two status fields. */
export function orderStatusLine(order: Pick<Order, "status" | "payment_status">) {
  switch (order.payment_status) {
    case "unpaid":
    case "pending":
      return { label: "Waiting for payment", tone: "wait" as const };
    case "expired":
      return { label: "Cancelled, not charged", tone: "off" as const };
    case "refunded":
      return { label: "Refunded", tone: "off" as const };
  }
  switch (order.status) {
    case "packing":
      return { label: "Packing", tone: "go" as const };
    case "ready":
      return { label: "Ready for pickup", tone: "ready" as const };
    case "completed":
      return { label: "Picked up", tone: "done" as const };
    default:
      // Orders from before online payment are paid in person, not yet.
      return order.payment_status === "pay_at_pickup"
        ? { label: "Pay at pickup", tone: "go" as const }
        : { label: "Paid", tone: "go" as const };
  }
}

export const STEPS = ["Paid", "Packing", "Ready", "Picked up"] as const;

/** The four step labels; an order paid in person starts at "Ordered", not "Paid". */
export const stepsFor = (order: Pick<Order, "payment_status">) =>
  order.payment_status === "pay_at_pickup" ? (["Ordered", ...STEPS.slice(1)] as const) : STEPS;

/** How far along the four steps a paid order is (0-3), or null if not paid. */
export function stepIndex(order: Pick<Order, "status" | "payment_status">) {
  if (order.payment_status !== "paid" && order.payment_status !== "pay_at_pickup") return null;
  return { new: 0, packing: 1, ready: 2, completed: 3 }[order.status];
}

export const canFinishPaying = (order: Pick<Order, "payment_status">) =>
  order.payment_status === "pending" || order.payment_status === "unpaid";
