import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatCents } from "@/lib/candy/money";
import {
  advanceOrder,
  completeConnect,
  getMyShop,
  setStock,
  startConnect,
  verifyIdentity,
} from "@/lib/candy/server";
import type { InventoryItem, OrderView, Profile, SellerLedger, ShopCard } from "@/lib/candy/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sell")({ component: SellPage });

const NEXT_LABEL: Record<OrderView["status"], string | null> = {
  new: "Start packing",
  packing: "Mark ready",
  ready: "Complete",
  completed: null,
};

function SellPage() {
  const { user, isPending } = useCurrentUserState();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<ShopCard | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [ledger, setLedger] = useState<SellerLedger | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [connectStep, setConnectStep] = useState<"idle" | "hosted" | "busy">("idle");

  async function refresh() {
    const data = await getMyShop();
    setProfile(data.profile);
    setShop(data.shop);
    setItems(data.items);
    setOrders(data.orders);
    setLedger(data.ledger);
    setLoaded(true);
  }

  useEffect(() => {
    if (!user) return;
    void refresh().catch(() => setLoaded(true));
  }, [user]);

  if (isPending) return <Skeleton className="h-40" />;
  if (!user) return <RedirectToSignIn />;
  if (!loaded) return <Skeleton className="h-64" />;

  if (!shop) {
    return (
      <main className="mx-auto max-w-lg rounded-[22px] bg-paper p-6 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-3xl font-extrabold">No shop on this account.</h1>
        <p className="mt-2 text-muted">Apply as a neighborhood seller to stock a catalog and pack orders.</p>
        <Button asChild className="mt-4">
          <Link to="/apply">Apply to sell</Link>
        </Button>
      </main>
    );
  }

  const connected = shop.connectStatus === "complete" && shop.chargesEnabled;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
          Seller desk
        </p>
        <h1 className="font-display text-4xl font-extrabold">{shop.shopName}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant={shop.status === "approved" ? "mint" : "cream"}>{shop.status}</Badge>
          <Badge variant={shop.identityVerified ? "mint" : "paper"}>
            {shop.identityVerified ? "ID verified" : profile?.identityStatus ?? "unstarted"}
          </Badge>
          <Badge variant={connected ? "mint" : "cream"}>
            {connected ? "Payouts on" : "Connect bank"}
          </Badge>
        </div>
        {shop.status !== "approved" ? (
          <p className="text-sm text-muted">
            Buyers cannot see this shop until an admin approves it. You can still set stock and
            connect payouts.
          </p>
        ) : null}
        {!shop.identityVerified ? (
          <Button
            variant="secondary"
            className="w-fit"
            onClick={() => {
              void verifyIdentity()
                .then(() => {
                  toast.success("Identity marked verified for this preview.");
                  return refresh();
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : "Could not verify."));
            }}
          >
            Mark ID verified (preview)
          </Button>
        ) : null}
      </header>

      {!connected ? (
        <ConnectPanel
          shop={shop}
          step={connectStep}
          onStart={() => {
            setConnectStep("busy");
            void startConnect()
              .then(() => {
                setConnectStep("hosted");
                return refresh();
              })
              .catch((err) => {
                setConnectStep("idle");
                toast.error(err instanceof Error ? err.message : "Could not start Connect.");
              });
          }}
          onComplete={() => {
            setConnectStep("busy");
            void completeConnect()
              .then(() => {
                setConnectStep("idle");
                toast.success("Bank connected. Charges go straight to you.");
                return refresh();
              })
              .catch((err) => {
                setConnectStep("hosted");
                toast.error(err instanceof Error ? err.message : "Could not finish Connect.");
              });
          }}
        />
      ) : ledger ? (
        <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
                Stripe Express · {shop.stripeAccountId}
              </p>
              <h2 className="font-display text-2xl font-extrabold">Payouts</h2>
              <p className="mt-1 max-w-[46ch] text-sm text-muted">
                Customers pay your connected account. Candy Lady never holds a balance. Payouts
                hit your bank in about 2 business days.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Paid orders", String(ledger.paidOrders)],
              ["You keep", formatCents(ledger.netCents)],
              ["Application fees", formatCents(ledger.applicationFeeCents)],
              ["Open payouts", formatCents(ledger.pendingPayoutCents)],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[16px] bg-cream p-3">
                <p className="text-xs font-bold text-muted">{label}</p>
                <p className="mt-1 font-display text-xl font-extrabold tabular-nums">{value}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Paid pickup queue</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No open paid orders.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/10">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-extrabold">
                    {order.pickupCode} · {order.buyerName}
                  </p>
                  <p className="text-sm text-muted">
                    {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                  </p>
                  <p className="text-sm tabular-nums text-muted">
                    Stripe pays you {formatCents(order.sellerPayoutCents)} · fee{" "}
                    {formatCents(order.platformFeeCents)}
                  </p>
                </div>
                {NEXT_LABEL[order.status] ? (
                  <Button
                    variant="cola"
                    onClick={() => {
                      void advanceOrder({ data: { orderId: order.id } })
                        .then(() => refresh())
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Could not update."));
                    }}
                  >
                    {NEXT_LABEL[order.status]}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Stock</h2>
        <ul className="mt-3 grid gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-[16px] bg-cream px-3 py-2",
                item.inventoryCount === 0 && "opacity-60",
              )}
            >
              <img src={item.imagePath} alt="" className="media size-12 rounded-[10px] object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.name}</p>
                <p className="text-xs tabular-nums text-muted">{formatCents(item.priceCents)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-[10px] bg-foam font-extrabold"
                  onClick={() => {
                    const next = Math.max(0, item.inventoryCount - 1);
                    void setStock({ data: { catalogId: item.id, inventoryCount: next } }).then(refresh);
                  }}
                  aria-label={`Decrease ${item.name}`}
                >
                  −
                </button>
                <span className="w-6 text-center font-extrabold tabular-nums">{item.inventoryCount}</span>
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-[10px] bg-foam font-extrabold"
                  onClick={() => {
                    const next = item.inventoryCount + 1;
                    void setStock({ data: { catalogId: item.id, inventoryCount: next } }).then(refresh);
                  }}
                  aria-label={`Increase ${item.name}`}
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function ConnectPanel({
  shop,
  step,
  onStart,
  onComplete,
}: {
  shop: ShopCard;
  step: "idle" | "hosted" | "busy";
  onStart: () => void;
  onComplete: () => void;
}) {
  const hosted = step === "hosted" || shop.connectStatus === "pending";
  return (
    <section className="rounded-[22px] bg-cola p-5 text-cream shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-cream/70">
        Stripe Connect Express · test mode
      </p>
      <h2 className="mt-1 font-display text-3xl font-extrabold">Connect bank to get paid.</h2>
      <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-cream/80">
        Stripe collects your ID and routing number. We never see those. After this, customers
        pay your account directly and we take a 10% application fee.
      </p>
      {!hosted ? (
        <Button
          className="mt-4 bg-cream text-cola hover:bg-cream/90"
          disabled={step === "busy"}
          onClick={onStart}
        >
          {step === "busy" ? "Opening Stripe…" : "Start Stripe onboarding"}
        </Button>
      ) : (
        <div className="mt-4 rounded-[16px] bg-cream p-4 text-ink">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
            Simulated Stripe-hosted form
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">Individual · United States</p>
          <ul className="mt-3 grid gap-1.5 text-sm text-muted">
            <li>Legal name and date of birth — Stripe only</li>
            <li>Photo ID + selfie match — Stripe Identity</li>
            <li>Bank account for T+2 payouts — Stripe only</li>
          </ul>
          <Button className="mt-4" disabled={step === "busy"} onClick={onComplete}>
            {step === "busy" ? "Verifying…" : "Complete test verification"}
          </Button>
        </div>
      )}
    </section>
  );
}
