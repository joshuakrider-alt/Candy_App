import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatCents } from "@/lib/candy/money";
import { advanceOrder, getMyProfile, listAdmin, reviewShop } from "@/lib/candy/server";
import type { AdminStats, OrderView, Profile, ShopCard } from "@/lib/candy/types";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pending, setPending] = useState<ShopCard[]>([]);
  const [shops, setShops] = useState<ShopCard[]>([]);
  const [queue, setQueue] = useState<OrderView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const data = await listAdmin();
    setProfile(data.profile);
    setStats(data.stats);
    setPending(data.pending);
    setShops(data.shops);
    setQueue(data.queue);
    setError(null);
    setLoaded(true);
  }

  useEffect(() => {
    if (!user) return;
    void getMyProfile({
      data: { name: user.displayName ?? undefined, email: user.primaryEmail ?? undefined },
    })
      .then(() => refresh())
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Not allowed.");
        setLoaded(true);
      });
  }, [user]);

  if (isPending) return <Skeleton className="h-40" />;
  if (!user) return <RedirectToSignIn />;
  if (!loaded) return <Skeleton className="h-64" />;

  if (error || profile?.role !== "admin") {
    return (
      <main className="mx-auto max-w-lg rounded-[22px] bg-paper p-6 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-3xl font-extrabold">Admin only.</h1>
        <p className="mt-2 text-muted">
          {error ?? "That account is not an admin. The first signed-in neighbor on this preview becomes admin."}
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">Platform</p>
          <h1 className="font-display text-4xl font-extrabold">Admin desk.</h1>
          <p className="mt-1 text-sm text-muted">
            Direct Charges — GMV never sits in a platform balance.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link to="/launch">Open Launch HQ</Link>
        </Button>
      </header>

      {stats ? (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Paid orders", String(stats.paidOrders)],
            ["GMV charged", formatCents(stats.collectedCents)],
            ["Application fees", formatCents(stats.feeEarnedCents)],
            ["Paid to sellers", formatCents(stats.paidToSellersCents)],
            ["Pending shops", String(stats.pendingShops)],
            ["Connect complete", String(stats.connectedShops)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-[22px] bg-paper p-4 shadow-[var(--shadow-card)]">
              <p className="text-xs font-bold text-muted">{label}</p>
              <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">{value}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Seller applications</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/10">
            {pending.map((shop) => (
              <li key={shop.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-extrabold">{shop.shopName}</p>
                  <p className="text-sm text-muted">
                    {shop.contactName} · {shop.neighborhood} · Connect {shop.connectStatus}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="cola"
                    onClick={() => {
                      void reviewShop({ data: { shopId: shop.id, status: "approved" } })
                        .then(refresh)
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"));
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void reviewShop({ data: { shopId: shop.id, status: "rejected" } })
                        .then(refresh)
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"));
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Open paid orders</h2>
        {queue.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Queue is clear.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink/10">
            {queue.map((order) => (
              <li key={order.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-extrabold">
                    {order.shopName} · {order.pickupCode}
                  </p>
                  <p className="text-sm text-muted">
                    {order.buyerName} · {formatCents(order.totalCents)} Direct Charge
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void advanceOrder({ data: { orderId: order.id } })
                      .then(refresh)
                      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"));
                  }}
                >
                  Advance
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-2xl font-extrabold">Shops</h2>
        <ul className="mt-3 grid gap-2">
          {shops.map((shop) => (
            <li key={shop.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-cream px-3 py-2">
              <div>
                <p className="font-bold">{shop.shopName}</p>
                <p className="text-xs text-muted">
                  {shop.neighborhood}
                  {shop.stripeAccountId ? ` · ${shop.stripeAccountId}` : " · payouts off"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge variant={shop.status === "approved" ? "mint" : "cream"}>{shop.status}</Badge>
                <Badge variant={shop.chargesEnabled ? "mint" : "paper"}>
                  {shop.chargesEnabled ? "charges on" : "connect"}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
