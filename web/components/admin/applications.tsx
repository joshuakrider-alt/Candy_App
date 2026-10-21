"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import type { Seller, SellerConnect } from "@/lib/types";

const PAYOUTS: Record<SellerConnect["status"], string> = {
  unstarted: "Stripe not connected",
  onboarding: "Stripe onboarding started",
  restricted: "Stripe needs more information",
  active: "Stripe ready",
};

const payouts = (seller: Seller) => PAYOUTS[seller.connect?.status ?? "unstarted"];

/** Seller applications waiting for review (PUT /applications/<id>), and the shops already live. */
export function Applications() {
  const client = useQueryClient();
  const pending = useQuery({
    queryKey: ["applications", "pending"],
    queryFn: () => api.get<Seller[]>("/applications?status=pending"),
  });
  const approved = useQuery({
    queryKey: ["applications", "approved"],
    queryFn: () => api.get<Seller[]>("/applications?status=approved"),
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Seller | null>(null);

  async function decide(seller: Seller, status: "approved" | "rejected") {
    setBusy(seller.id);
    try {
      await api.put(`/applications/${seller.id}`, { status });
      toast.success(status === "approved" ? `${seller.shop_name} is live.` : `${seller.shop_name} was turned down.`);
      setRejecting(null);
      await client.invalidateQueries({ queryKey: ["applications"] });
    } catch (e) {
      // e.g. 409 when ID checks are required and the owner hasn't done one.
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-paper/95 p-4 shadow-candy">
          <p className="text-sm font-bold text-muted-foreground">Waiting for review</p>
          <p className="font-heading text-3xl font-extrabold text-cola">{pending.data?.length ?? "–"}</p>
        </div>
        <div className="rounded-lg bg-paper/95 p-4 shadow-candy">
          <p className="text-sm font-bold text-muted-foreground">Live shops</p>
          <p className="font-heading text-3xl font-extrabold text-cola">{approved.data?.length ?? "–"}</p>
        </div>
      </div>

      <Panel title="Applications">
        {pending.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : pending.error ? (
          <p role="alert" className="font-bold text-destructive">
            {errorText(pending.error, "Could not load applications.")}
          </p>
        ) : !pending.data.length ? (
          <p className="text-muted-foreground">No applications waiting for review.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.data.map((seller) => (
              <li
                key={seller.id}
                aria-label={seller.shop_name}
                className="flex flex-col gap-3 rounded-md border border-border bg-white p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 text-sm text-cola">
                  <h3 className="font-heading text-lg font-extrabold">{seller.shop_name}</h3>
                  <p>
                    {seller.neighborhood} · {seller.pickup_window}
                  </p>
                  <p>
                    {seller.contact_name} · {seller.contact_email ?? "no email"}
                  </p>
                  <p className="text-muted-foreground">
                    {payouts(seller)} · ID check: {seller.identity_verified ? "done" : "not done"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => decide(seller, "approved")} disabled={busy === seller.id} className="rounded-full font-extrabold">
                    Approve
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(seller)} disabled={busy === seller.id} className="rounded-full font-bold">
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Live shops">
        {approved.data?.length ? (
          <ul className="divide-y divide-border text-sm text-cola">
            {approved.data.map((seller) => (
              <li key={seller.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-bold">{seller.shop_name}</span>
                <span className="text-muted-foreground">{payouts(seller)}</span>
              </li>
            ))}
          </ul>
        ) : approved.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <p className="text-muted-foreground">No live shops yet.</p>
        )}
      </Panel>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && busy === null && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl text-cola">Turn down {rejecting?.shop_name}?</DialogTitle>
            <DialogDescription>Their shop won&apos;t go live. They can still sign in and will see it wasn&apos;t approved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} className="rounded-full">
              Go back
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejecting && decide(rejecting, "rejected")}
              disabled={busy !== null}
              className="rounded-full font-extrabold"
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
