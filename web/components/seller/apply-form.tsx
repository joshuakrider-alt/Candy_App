"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, Panel } from "@/components/panel";
import { ShopTitlePicker } from "@/components/seller/shop-title-picker";
import { DEFAULT_SHOP_TITLE, cleanShopTitle, shopTitleProblem } from "@/lib/shop-title";
import { errorText } from "@/lib/error-text";
import { api, auth } from "@/lib/api";
import { useRefreshSession } from "@/lib/use-session";

const field = "flex flex-col gap-1.5 text-sm font-bold text-cola";

/**
 * POST /applications creates the shop (pending) and its seller login in one
 * go; the new seller is then signed in and taken to the dashboard.
 */
export function ApplyForm() {
  const router = useRouter();
  const refreshSession = useRefreshSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // New shops start as "Candy Shop"; the seller can pick another or their own.
  const [title, setTitle] = useState<string>(DEFAULT_SHOP_TITLE);
  const [customTitle, setCustomTitle] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (password !== data.get("password_confirm")) {
      setError("The two passwords don't match.");
      return;
    }
    const titleProblem = shopTitleProblem(title);
    if (titleProblem) {
      setError(titleProblem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/applications", {
        shop_name: text("shop_name"),
        shop_title: cleanShopTitle(title),
        contact_name: text("contact_name"),
        neighborhood: text("neighborhood"),
        pickup_window: text("pickup_window"),
        email: text("email"),
        password,
      });
    } catch (e) {
      setError(errorText(e, "Could not send your application."));
      setBusy(false);
      return;
    }
    try {
      await auth.login(text("email"), password);
      await refreshSession();
      router.replace("/seller");
      router.refresh();
    } catch {
      // The application went through; only the automatic sign-in failed.
      router.replace("/login?next=/seller");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Panel title="Your shop">
        <div className="flex flex-col gap-3">
          <label className={field}>
            Shop name
            <Input name="shop_name" required maxLength={200} placeholder="Ms. Kiki's Snack Spot" className="h-11 bg-white" />
          </label>
          <ShopTitlePicker
            value={title}
            custom={customTitle}
            onChange={(next, custom) => {
              setTitle(next);
              setCustomTitle(custom);
            }}
          />
          <label className={field}>
            Your name
            <Input name="contact_name" required autoComplete="name" placeholder="Kiana Roberts" className="h-11 bg-white" />
          </label>
          <label className={field}>
            Neighborhood
            <Input name="neighborhood" required placeholder="Cherry Hill" className="h-11 bg-white" />
          </label>
          <label className={field}>
            Pickup times
            <Input name="pickup_window" required placeholder="Weekdays, 2:30 PM to 7:00 PM" className="h-11 bg-white" />
          </label>
        </div>
      </Panel>
      <Panel title="Your seller login" description="Use an email you don't already shop with here.">
        <div className="flex flex-col gap-3">
          <label className={field}>
            Email
            <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="h-11 bg-white" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={field}>
              Password (at least 8 characters)
              <Input name="password" type="password" required minLength={8} autoComplete="new-password" className="h-11 bg-white" />
            </label>
            <label className={field}>
              Type it again
              <Input name="password_confirm" type="password" required minLength={8} autoComplete="new-password" className="h-11 bg-white" />
            </label>
          </div>
        </div>
      </Panel>
      <FormMessage error>{error}</FormMessage>
      <Button type="submit" disabled={busy} className="h-12 self-start rounded-full px-8 text-base font-extrabold">
        {busy ? "Sending…" : "Send application"}
      </Button>
    </form>
  );
}
