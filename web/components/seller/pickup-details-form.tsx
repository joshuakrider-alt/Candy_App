"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, Panel } from "@/components/panel";
import { useSellerId, useSellerShop, useSetSellerShop } from "@/components/seller/seller-shop";
import { errorText } from "@/lib/error-text";
import { api } from "@/lib/api";
import type { Seller } from "@/lib/types";

// The limits in backend/models.py. Flask checks them too.
export const PICKUP_ADDRESS_MAX = 300;
export const PICKUP_NOTE_MAX = 200;

const field = "flex flex-col gap-1.5 text-sm font-bold text-cola";

/** The shop's private street address and door note, sent only to buyers with a paid order. */
export function PickupDetailsForm() {
  const sellerId = useSellerId();
  const seller = useSellerShop();
  const setShop = useSetSellerShop();
  const [address, setAddress] = useState(seller.pickup_address ?? "");
  const [note, setNote] = useState(seller.pickup_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address.trim()) {
      setError("Add the street address buyers should come to.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setShop(
        await api.put<Seller>(`/sellers/${sellerId}/pickup`, {
          pickup_address: address.trim(),
          pickup_note: note.trim(),
        }),
      );
      toast.success("Pickup details saved.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Pickup details"
      description="Only buyers who have paid for an order see these, on their receipt and order page. Your shop page and the shop list only ever show your neighborhood."
    >
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className={field}>
          Pickup address
          <textarea
            name="pickup_address"
            value={address}
            required
            rows={2}
            maxLength={PICKUP_ADDRESS_MAX}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Cherry Ln, Apt 2"
            autoComplete="street-address"
            className="min-h-16 rounded-lg border border-input bg-white px-2.5 py-2 text-base font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
        </label>
        <label className={field}>
          Pickup note (optional, {note.length}/{PICKUP_NOTE_MAX})
          <Input
            name="pickup_note"
            value={note}
            maxLength={PICKUP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ring the side door"
            className="h-11 bg-white"
          />
        </label>
        <FormMessage error>{error}</FormMessage>
        <Button type="submit" disabled={busy} className="self-start rounded-full px-6 font-extrabold">
          Save pickup details
        </Button>
      </form>
    </Panel>
  );
}
