"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Panel } from "@/components/seller/panel";
import { errorText, useSellerId, useSellerShop } from "@/components/seller/seller-shop";
import { api } from "@/lib/api";
import type { ConnectState, SellerConnect } from "@/lib/types";

const LABELS: Record<SellerConnect["status"], string> = {
  unstarted: "Not connected",
  onboarding: "Connected, but Stripe needs more information",
  restricted: "Connected, but Stripe needs more information",
  active: "Ready: card orders pay out to you",
};

const UNSTARTED: SellerConnect = {
  status: "unstarted",
  account_id: null,
  charges_enabled: false,
  details_submitted: false,
  updated_at: null,
};

/**
 * Stripe Connect payouts. Stripe sends the seller back to /seller.html?stripe=
 * return (finished or left) or =refresh (the one-time link expired), which
 * next.config.ts redirects here with the query kept.
 */
export function PayoutsPanel() {
  const sellerId = useSellerId();
  const shop = useSellerShop();
  const [connect, setConnect] = useState<SellerConnect>(shop.connect ?? UNSTARTED);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledReturn = useRef(false);
  const ready = connect.status === "active";

  async function start() {
    setBusy(true);
    setError(null);
    setNote("Opening Stripe…");
    try {
      const payload = await api.post<ConnectState>(`/sellers/${sellerId}/stripe/connect`);
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setConnect(payload);
      setNote(null);
    } catch (e) {
      setNote(null);
      setError(errorText(e, "Stripe setup could not start."));
    }
    setBusy(false);
  }

  async function check() {
    setError(null);
    try {
      const payload = await api.get<ConnectState>(`/sellers/${sellerId}/stripe/status`);
      setConnect(payload);
      return payload;
    } catch (e) {
      setError(errorText(e, "Could not check your payout setup."));
      return null;
    }
  }

  async function openDashboard() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.post<{ url: string }>(`/sellers/${sellerId}/stripe/dashboard`);
      window.location.assign(url);
      return;
    } catch (e) {
      setError(errorText(e, "Could not open your Stripe dashboard."));
    }
    setBusy(false);
  }

  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("stripe");
    if (!outcome) return;
    url.searchParams.delete("stripe");
    window.history.replaceState(null, "", url.pathname + url.search);
    // Only the account itself is trustworthy, so ask Flask to read it from Stripe.
    setNote("Checking your Stripe setup…");
    void check().then((payload) => {
      if (!payload) return setNote(null);
      if (payload.status === "active") return setNote("You're all set. Buyers can pay by card at your shop.");
      if (outcome === "refresh") return void start();
      setNote("Stripe still needs a few details before cards can be turned on.");
    });
    // Runs once, on arrival from Stripe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Panel
      title="Payouts"
      description="Buyers pay by card through Stripe, and Stripe pays your share straight to your bank. Nothing you type at Stripe (bank, SSN) comes to us."
    >
      <div className="flex flex-col gap-4">
        <p className="text-lg font-extrabold text-cola">{LABELS[connect.status]}</p>
        {!ready && (
          <p className="text-sm text-cola">Buyers can&apos;t pay by card at your shop until Stripe setup is finished.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!ready && (
            <Button onClick={start} disabled={busy || shop.status === "rejected"} className="rounded-full px-6 font-extrabold">
              {connect.status === "unstarted" ? "Set up payouts with Stripe" : "Finish Stripe setup"}
            </Button>
          )}
          {!ready && connect.status !== "unstarted" && (
            <Button variant="outline" onClick={() => void check()} disabled={busy} className="rounded-full font-bold">
              Check again
            </Button>
          )}
          {connect.details_submitted && (
            <Button variant="outline" onClick={openDashboard} disabled={busy} className="rounded-full font-bold">
              Open Stripe dashboard
            </Button>
          )}
        </div>
        <FormMessage>{note}</FormMessage>
        <FormMessage error>{error}</FormMessage>
      </div>
    </Panel>
  );
}
