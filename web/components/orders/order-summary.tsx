import { money } from "@/lib/format";
import type { Order } from "@/lib/types";

export function OrderItems({ order }: { order: Order }) {
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1 text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span>
              {item.quantity} × {item.candy?.name ?? "Item"}
            </span>
            <span className="tabular-nums">{money(item.line_total_cents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex justify-between border-t border-border pt-2 font-extrabold">
        <span>Total</span>
        <span className="tabular-nums">{money(order.total_cents)}</span>
      </p>
      {/* Flask keeps a partly refunded order "paid" and records the amount here. */}
      {order.refunded_cents > 0 && (
        <>
          <p className="flex justify-between text-sm">
            <span>Refunded</span>
            <span className="tabular-nums">−{money(order.refunded_cents)}</span>
          </p>
          <p className="flex justify-between font-extrabold">
            <span>You paid</span>
            <span className="tabular-nums">{money(order.total_cents - order.refunded_cents)}</span>
          </p>
        </>
      )}
    </div>
  );
}
