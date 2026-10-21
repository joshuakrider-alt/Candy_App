"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, api } from "@/lib/api";
import { money } from "@/lib/format";
import type { Order } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { cartTotal, useCart } from "@/store/cart";

/** Flask's known refusals, in words a buyer can act on. */
function checkoutMessage(error: unknown) {
  if (!(error instanceof ApiRequestError)) return "Something went wrong. Try again.";
  if (/cannot accept card payments/i.test(error.message))
    return "This shop hasn't finished setting up card payments, so it can't take orders yet.";
  if (error.status === 503 && /not configured/i.test(error.message))
    return "Card payments aren't switched on for this site yet.";
  if (/insufficient inventory for (.+)/i.test(error.message)) {
    const name = error.message.match(/insufficient inventory for (.+)/i)![1];
    return `${name} just sold out or has fewer left than in your cart. Open the shop to see what's left.`;
  }
  return error.message.charAt(0).toUpperCase() + error.message.slice(1);
}

/**
 * Pay: POST /orders through the proxy. Flask holds the stock, prices the
 * order and returns Stripe's checkout_url. The cart is kept until the payment
 * is confirmed on /checkout/return, so backing out of Stripe loses nothing.
 */
export function CheckoutButton({ onError }: { onError: (message: string | null) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { sellerId, lines } = useCart();
  const [busy, setBusy] = useState(false);
  // Flask prices the order from the current shelf; if that differs from the
  // cart (a price changed since it was saved), the buyer sees the new total first.
  const [repriced, setRepriced] = useState<{ total: number; url: string } | null>(null);
  const total = cartTotal(lines);
  // A changed cart is a different order, so Pay starts over.
  useEffect(() => setRepriced(null), [lines]);

  async function pay() {
    onError(null);
    if (!session.data?.user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const order = await api.post<Order>("/orders", {
        seller_id: sellerId,
        items: lines.map((l) => ({ candy_id: l.candyId, quantity: l.qty })),
        // Stripe sends the buyer back to the shop's page or the marketplace.
        return_to: pathname.startsWith("/s/") ? "shop" : "marketplace",
      });
      if (!order.checkout_url) throw new ApiRequestError("Stripe did not open a checkout page. Try again.", 502);
      if (order.total_cents !== total) {
        setRepriced({ total: order.total_cents, url: order.checkout_url });
        onError(`Prices changed since you added these. Your total is now ${money(order.total_cents)}.`);
        setBusy(false);
        return;
      }
      window.location.assign(order.checkout_url);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      onError(checkoutMessage(error));
      setBusy(false);
    }
  }

  if (repriced) {
    return (
      <Button onClick={() => window.location.assign(repriced.url)} className="h-12 rounded-full text-base font-extrabold">
        Pay {money(repriced.total)} &amp; reserve
      </Button>
    );
  }

  // Flask's POST /orders takes buyer and admin accounts only.
  if (session.data?.user?.role === "seller") {
    return (
      <>
        <Button disabled className="h-12 rounded-full text-base font-extrabold">
          Pay {money(total)} &amp; reserve
        </Button>
        <p className="text-sm text-muted-foreground">Seller accounts can&apos;t place orders. Sign in with a buyer account to buy.</p>
      </>
    );
  }

  return (
    <Button onClick={pay} disabled={busy || !lines.length} className="h-12 rounded-full text-base font-extrabold">
      {busy ? "Opening secure checkout…" : session.data?.user ? `Pay ${money(total)} & reserve` : "Sign in to pay"}
    </Button>
  );
}
