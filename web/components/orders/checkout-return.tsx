"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderItems } from "@/components/orders/order-summary";
import { PickupCode } from "@/components/orders/pickup-code";
import { finishPaying, releaseItems, sentence } from "@/components/orders/use-order-actions";
import { ApiRequestError, api } from "@/lib/api";
import type { Order } from "@/lib/types";
import { useSession } from "@/lib/use-session";
import { useCart } from "@/store/cart";

type Params = { order?: string; session_id?: string; payment?: string; shop?: string };

type View =
  | { kind: "loading" }
  | { kind: "app-handoff"; link: string }
  | { kind: "paid"; order: Order }
  | { kind: "cancelled"; orderId: number }
  | { kind: "released" }
  | { kind: "not-paid"; order: Order }
  | { kind: "error"; message: string }
  | { kind: "sign-in" };

/** Where Stripe's success and cancel links land (via the redirects in next.config.ts). */
export function CheckoutReturn({ params }: { params: Params }) {
  const session = useSession();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const orderId = Number(params.order);
  const returnTo = params.shop ? "shop" : "marketplace";
  const returnedFromStripe = Boolean(params.session_id) || params.payment === "cancelled";

  useEffect(() => {
    if (session.isPending || started.current) return;
    started.current = true;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      setView({ kind: "error", message: "This link is missing its order number." });
      return;
    }

    // The Android app pays in a Chrome Custom Tab that has no website session.
    // A web buyer is always signed in by the time Stripe sends them back, so
    // "back from Stripe with nobody signed in" means the app's tab. Hand off to
    // the app with only the order number, never the Stripe session id. Kept
    // exactly as the old site does it until the app itself is revised.
    if (returnedFromStripe && !session.data?.user) {
      const link = `candylady://checkout-return?order=${encodeURIComponent(String(orderId))}`;
      setView({ kind: "app-handoff", link });
      // Only jump where the scheme is registered; elsewhere a dead scheme can
      // replace this page with a browser error.
      if (/Android/i.test(navigator.userAgent)) window.location.href = link;
      return;
    }
    if (!session.data?.user) {
      setView({ kind: "sign-in" });
      return;
    }

    if (params.payment === "cancelled") {
      setView({ kind: "cancelled", orderId });
      return;
    }

    api
      .post<Order>(`/orders/${orderId}/payment/confirm`)
      .then((order) => {
        if (order.payment_status === "paid") {
          useCart.getState().clear();
          setView({ kind: "paid", order });
        } else {
          setView({ kind: "not-paid", order });
        }
      })
      .catch((error) =>
        setView({ kind: "error", message: error instanceof ApiRequestError ? sentence(error.message) : "Could not confirm the payment." }),
      );
  }, [session.isPending, session.data, orderId, params.payment, returnedFromStripe]);

  async function onFinishPaying() {
    setBusy(true);
    try {
      const order = await finishPaying(orderId, returnTo);
      if (order?.payment_status === "paid") {
        useCart.getState().clear();
        setView({ kind: "paid", order });
      }
    } catch (error) {
      setView({ kind: "error", message: error instanceof ApiRequestError ? sentence(error.message) : "Could not reopen checkout." });
    } finally {
      setBusy(false);
    }
  }

  async function onRelease() {
    setBusy(true);
    try {
      await releaseItems(orderId);
      setView({ kind: "released" });
    } catch (error) {
      setView({ kind: "error", message: error instanceof ApiRequestError ? sentence(error.message) : "Could not release the items." });
    } finally {
      setBusy(false);
    }
  }

  const shopHref = params.shop ? `/s/${encodeURIComponent(params.shop)}` : "/shops";

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-5 rounded-xl bg-paper/95 p-6 shadow-candy sm:p-8">
      {view.kind === "loading" && (
        <div className="flex flex-col gap-3" aria-busy>
          <p className="font-bold text-muted-foreground">Confirming your payment…</p>
          <Skeleton className="h-14 w-64 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </div>
      )}

      {view.kind === "app-handoff" && (
        <>
          <h1 className="text-3xl font-extrabold text-cola">Taking you back to the app…</h1>
          <p>
            If you are still here in a moment,{" "}
            <a href={view.link} className="font-bold text-cherry-deep underline">
              reopen The Candy Lady
            </a>{" "}
            to see your pickup code. Your order is safe either way.
          </p>
        </>
      )}

      {view.kind === "paid" && (
        <>
          <div>
            <p className="text-xs font-extrabold tracking-[0.12em] text-ember uppercase">Order placed</p>
            <h1 className="mt-1 text-3xl font-extrabold text-cola">Show this code at pickup</h1>
          </div>
          {view.order.pickup_code && <PickupCode code={view.order.pickup_code} />}
          {view.order.seller && (
            <div className="flex flex-col gap-1 rounded-md bg-muted p-4 text-cola">
              <p className="font-heading text-xl font-bold">{view.order.seller.shop_name}</p>
              <p className="flex items-center gap-1.5 text-sm">
                <MapPin aria-hidden className="size-4" /> {view.order.seller.neighborhood}
              </p>
              <p className="flex items-center gap-1.5 text-sm">
                <Clock aria-hidden className="size-4" /> {view.order.seller.pickup_window}
              </p>
            </div>
          )}
          <OrderItems order={view.order} />
          <p className="text-sm text-muted-foreground">
            Order #{view.order.id}. Wait until the shop marks it ready; you can follow it in your orders.
          </p>
          <Link href="/account/orders" className={buttonVariants({ className: "h-11 rounded-full font-extrabold" })}>
            See your orders
          </Link>
        </>
      )}

      {view.kind === "cancelled" && (
        <>
          <h1 className="text-3xl font-extrabold text-cola">Order #{view.orderId} is not paid</h1>
          <p>Nothing was charged. Your items are held for a short while: finish paying, or release them for someone else.</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onFinishPaying} disabled={busy} className="h-11 rounded-full px-6 font-extrabold">
              Finish paying
            </Button>
            <Button onClick={onRelease} disabled={busy} variant="outline" className="h-11 rounded-full px-6 font-extrabold">
              Release items
            </Button>
          </div>
        </>
      )}

      {view.kind === "released" && (
        <>
          <h1 className="text-3xl font-extrabold text-cola">Items released</h1>
          <p>The order is cancelled and nothing was charged. Your cart still has the items if you change your mind.</p>
          <Link href={shopHref} className={buttonVariants({ className: "h-11 rounded-full font-extrabold" })}>
            Back to the shop
          </Link>
        </>
      )}

      {view.kind === "not-paid" && (
        <>
          <h1 className="text-3xl font-extrabold text-cola">Not paid yet</h1>
          <p>
            Stripe hasn&apos;t confirmed a payment for order #{view.order.id}.{" "}
            {view.order.payment_status === "expired"
              ? "The checkout expired and the items went back on the shelf."
              : "If you just paid, give it a minute and check your orders."}
          </p>
          <Link href="/account/orders" className={buttonVariants({ className: "h-11 rounded-full font-extrabold" })}>
            See your orders
          </Link>
        </>
      )}

      {view.kind === "sign-in" && (
        <>
          <h1 className="text-3xl font-extrabold text-cola">Sign in to see this order</h1>
          <Link
            href={`/login?next=${encodeURIComponent(`/account/orders`)}`}
            className={buttonVariants({ className: "h-11 rounded-full font-extrabold" })}
          >
            Sign in
          </Link>
        </>
      )}

      {view.kind === "error" && (
        <>
          <h1 className="text-3xl font-extrabold text-cola">Something went wrong</h1>
          <p role="alert">{view.message}</p>
          <Link href="/account/orders" className={buttonVariants({ variant: "outline", className: "h-11 rounded-full font-extrabold" })}>
            See your orders
          </Link>
        </>
      )}
    </section>
  );
}
