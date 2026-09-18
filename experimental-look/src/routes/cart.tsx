import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MoneyFlow } from "@/components/money-flow";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cartTotalCents, useCart } from "@/lib/candy/cart";
import { checkout } from "@/lib/candy/server";
import { formatCents, splitCharge } from "@/lib/candy/money";

export const Route = createFileRoute("/cart")({ component: CartPage });

function CartPage() {
  const { user, isPending } = useCurrentUserState();
  const { items, shopId, shopName, setQty, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const navigate = useNavigate();
  const total = cartTotalCents(items);
  const split = splitCharge(total);

  if (needsAuth) return <RedirectToSignIn />;

  async function pay() {
    if (!shopId || items.length === 0) return;
    if (isPending) return;
    if (!user) {
      setNeedsAuth(true);
      return;
    }
    setBusy(true);
    try {
      const order = await checkout({
        data: {
          shopId,
          buyerName: user.displayName || user.primaryEmail || "Neighbor",
          items: items.map((item) => ({ catalogId: item.catalogId, quantity: item.quantity })),
        },
      });
      clear();
      toast.success(`Paid to ${shopName} · ${order.pickupCode}`);
      await navigate({ to: "/orders" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed.";
      if (message === "Unauthorized") setNeedsAuth(true);
      else toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Bag</p>
        <h1 className="font-display text-4xl font-extrabold">Your pickup order.</h1>
        {shopName ? <p className="mt-1 text-muted">From {shopName}</p> : null}
      </header>

      {items.length === 0 ? (
        <div className="rounded-[22px] bg-paper p-6 shadow-[var(--shadow-card)]">
          <p className="font-bold">Your bag is empty.</p>
          <Link to="/shop" className="mt-3 inline-block font-bold text-cherry">
            Browse shops
          </Link>
        </div>
      ) : (
        <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
          <ul className="flex flex-col divide-y divide-ink/10">
            {items.map((item) => (
              <li key={item.catalogId} className="flex items-center gap-3 py-3">
                <img
                  src={item.imagePath}
                  alt=""
                  className="media size-16 rounded-[12px] object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-extrabold">{item.name}</p>
                  <p className="text-sm font-bold tabular-nums text-muted">
                    {formatCents(item.priceCents)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-[10px] bg-foam font-extrabold"
                    onClick={() => setQty(item.catalogId, item.quantity - 1)}
                    aria-label={`Remove one ${item.name}`}
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-extrabold tabular-nums">{item.quantity}</span>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-[10px] bg-foam font-extrabold"
                    onClick={() => setQty(item.catalogId, item.quantity + 1)}
                    aria-label={`Add one ${item.name}`}
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <MoneyFlow split={split} sellerName={shopName ?? "this seller"} compact />
          </div>

          <Button className="mt-5 w-full" size="lg" disabled={busy} onClick={() => void pay()}>
            {busy
              ? "Charging seller’s Stripe…"
              : user
                ? `Pay ${formatCents(total)} to ${shopName}`
                : "Sign in to pay"}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            This preview marks the Direct Charge paid and issues a pickup code. Live checkout
            uses Stripe Checkout on the seller’s connected account — we never hold the funds.
          </p>
        </section>
      )}
    </main>
  );
}
