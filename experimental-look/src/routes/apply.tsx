import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { applyAsSeller, getMyProfile } from "@/lib/candy/server";
import type { Profile, ShopCard } from "@/lib/candy/types";

export const Route = createFileRoute("/apply")({ component: ApplyPage });

function ApplyPage() {
  const { user, isPending } = useCurrentUserState();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<ShopCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    shopName: "",
    contactName: "",
    neighborhood: "",
    pickupWindow: "Weekdays, 3:00 PM – 6:30 PM",
  });

  useEffect(() => {
    if (!user) return;
    void getMyProfile({
      data: { name: user.displayName ?? undefined, email: user.primaryEmail ?? undefined },
    }).then(setProfile);
  }, [user]);

  if (isPending) return null;
  if (!user) return <RedirectToSignIn />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await applyAsSeller({
        data: {
          ...form,
          name: user?.displayName ?? undefined,
          email: user?.primaryEmail ?? undefined,
        },
      });
      setProfile(result.profile);
      setShop(result.shop);
      toast.success(result.already ? "You already have a shop on file." : "Application submitted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply.");
    } finally {
      setBusy(false);
    }
  }

  const existing = shop || (profile?.shopId ? true : false);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-5">
      <header>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
          Sellers
        </p>
        <h1 className="font-display text-4xl font-extrabold">Apply to sell.</h1>
        <p className="mt-2 text-muted">
          Neighborhood sellers request access. After approval, connect Stripe so customers pay
          you directly. We never hold your money.
        </p>
      </header>

      {shop ? (
        <section className="rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
            {shop.status}
          </p>
          <h2 className="font-display text-3xl font-extrabold">{shop.shopName}</h2>
          <p className="mt-2 text-sm text-muted">
            {shop.neighborhood} · {shop.pickupWindow}
          </p>
          <p className="mt-2 text-sm text-muted">
            Payouts: {shop.chargesEnabled ? "charges enabled" : "connect your bank on the seller desk"}
          </p>
          <Link to="/sell" className="mt-4 inline-block font-bold text-cherry">
            Open seller desk
          </Link>
        </section>
      ) : (
        <form className="grid gap-3 rounded-[22px] bg-paper p-5 shadow-[var(--shadow-card)]" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="shopName">Shop name</Label>
            <Input
              id="shopName"
              required
              value={form.shopName}
              onChange={(e) => setForm({ ...form, shopName: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contactName">Your name</Label>
            <Input
              id="contactName"
              required
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="neighborhood">Neighborhood</Label>
            <Input
              id="neighborhood"
              required
              value={form.neighborhood}
              onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pickupWindow">Pickup window</Label>
            <Input
              id="pickupWindow"
              required
              value={form.pickupWindow}
              onChange={(e) => setForm({ ...form, pickupWindow: e.target.value })}
            />
          </div>
          <Button type="submit" disabled={busy || Boolean(existing && !shop)}>
            {busy ? "Submitting…" : "Submit application"}
          </Button>
        </form>
      )}
    </main>
  );
}
