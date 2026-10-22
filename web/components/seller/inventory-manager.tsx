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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage, Panel } from "@/components/panel";
import { errorText } from "@/lib/error-text";
import { useSellerId, useSellerShop } from "@/components/seller/seller-shop";
import { refreshShopPages } from "@/app/actions/refresh-shops";
import { api, ApiRequestError } from "@/lib/api";
import { money } from "@/lib/format";
import type { InventoryItem, StockStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STOCK_LABEL: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
};

/** What the dialog is open for: a new item, one of the shop's own items, or a catalog item's count. */
type Editing = { mode: "new" } | { mode: "own"; item: InventoryItem } | { mode: "count"; item: InventoryItem };

const field = "flex flex-col gap-1.5 text-sm font-bold text-cola";

/** What is on the shelf: units for sale plus units held by open checkouts. */
const onHand = (item: InventoryItem) => item.on_hand_count ?? item.inventory_count;

/** Dollars typed by a seller ("1.50", "$2") to cents, or null when it isn't a price. */
export function toCents(value: string) {
  const text = value.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

function ItemDialog({ editing, onClose, onSaved }: { editing: Editing | null; onClose: () => void; onSaved: () => void }) {
  const sellerId = useSellerId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = editing && editing.mode !== "new" ? editing.item : null;
  const candy = item?.candy;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const count = Number(data.get("inventory_count"));
    if (!Number.isInteger(count) || count < 0) {
      setError("Stock must be a whole number, 0 or more.");
      return;
    }
    // The count is what is on the shelf. Flask takes the units held by open
    // checkouts back off on_hand_count, and answers 409 if the held units
    // are no longer the ones shown here. inventory_count, the count for sale,
    // is only read by an API from before on_hand_count. A new item has
    // nothing held yet.
    const held = item?.reserved_count ?? 0;
    if (count < held) {
      setError(`${held} are held in open checkouts, so count at least ${held}.`);
      return;
    }
    let body: Record<string, unknown> = { on_hand_count: count, reserved_count: held, inventory_count: count - held };
    if (item) body.seen_inventory_count = item.inventory_count;
    if (editing.mode !== "count") {
      const priceCents = toCents(String(data.get("price") ?? ""));
      if (priceCents === null) {
        setError("Enter the price in dollars, like 1.50.");
        return;
      }
      body = {
        ...body,
        name: String(data.get("name") ?? "").trim(),
        description: String(data.get("description") ?? "").trim(),
        price_cents: priceCents,
      };
    }
    setBusy(true);
    setError(null);
    try {
      if (editing.mode === "new") await api.post(`/sellers/${sellerId}/items`, body);
      else if (editing.mode === "own") await api.put(`/sellers/${sellerId}/items/${editing.item.candy_id}`, body);
      else await api.put(`/sellers/${sellerId}/inventory/${editing.item.candy_id}`, body);
      await refreshShopPages().catch(() => {});
      toast.success(editing.mode === "new" ? "Item added to your shop." : "Saved.");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        // Held units changed while the dialog was open: start again from the new counts.
        toast.error(errorText(e));
        onSaved();
        onClose();
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const title = editing?.mode === "new" ? "Add an item" : editing?.mode === "own" ? "Edit item" : `Stock of ${candy?.name}`;

  return (
    <Dialog open={!!editing} onOpenChange={(open) => !open && !busy && (onClose(), setError(null))}>
      <DialogContent>
        {/* Keyed so each opening starts from that item's own values. */}
        <form key={item?.id ?? "new"} onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl text-cola">{title}</DialogTitle>
            {editing?.mode === "count" && (
              <DialogDescription>This item is from the shared catalog, so only your stock can change.</DialogDescription>
            )}
          </DialogHeader>
          {editing?.mode !== "count" && (
            <>
              <label className={field}>
                Name
                <Input name="name" required maxLength={200} defaultValue={candy?.name ?? ""} className="h-11 bg-white" />
              </label>
              <label className={field}>
                Price in dollars
                <Input
                  name="price"
                  required
                  inputMode="decimal"
                  placeholder="1.50"
                  defaultValue={candy ? (candy.price_cents / 100).toFixed(2) : ""}
                  className="h-11 bg-white"
                />
              </label>
              <label className={field}>
                Description (optional)
                <Input name="description" maxLength={500} defaultValue={candy?.description ?? ""} className="h-11 bg-white" />
              </label>
            </>
          )}
          <label className={field}>
            {editing?.mode === "new" ? "How many you have" : "How many are on your shelf"}
            <Input
              name="inventory_count"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={item ? onHand(item) : 10}
              className="h-11 bg-white"
            />
            {!!item?.reserved_count && (
              <span className="font-normal text-muted-foreground">
                Include the {item.reserved_count} held in open checkouts; leave out ones packed for paid orders.
              </span>
            )}
          </label>
          <FormMessage error>{error}</FormMessage>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="rounded-full">
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="rounded-full font-extrabold">
              {editing?.mode === "new" ? "Add item" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ item, onClose, onRemoved }: { item: InventoryItem | null; onClose: () => void; onRemoved: () => void }) {
  const sellerId = useSellerId();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      await api.delete(`/sellers/${sellerId}/items/${item.candy_id}`);
      await refreshShopPages().catch(() => {});
      toast.success("Item removed.");
      onRemoved();
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl text-cola">Remove {item?.candy?.name}?</DialogTitle>
          <DialogDescription>Buyers won&apos;t see it any more. Past orders keep their details.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full">
            Keep it
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy} className="rounded-full font-extrabold">
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Stock toggles for every item, plus the shop's own items (add, edit, remove). */
export function InventoryManager() {
  const sellerId = useSellerId();
  const shop = useSellerShop();
  const client = useQueryClient();
  const key = ["seller-inventory", sellerId];
  const { data: items, error, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api.get<InventoryItem[]>(`/sellers/${sellerId}/inventory`),
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<InventoryItem | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const reload = () => client.invalidateQueries({ queryKey: key });

  async function toggle(item: InventoryItem) {
    const out = item.status === "out-of-stock";
    // Same rule as the old page: back in stock starts at no fewer than 8.
    const body = out
      ? {
          status: "in-stock",
          // At least 8 for sale, on top of any units held by open checkouts.
          on_hand_count: Math.max(8, item.inventory_count) + (item.reserved_count ?? 0),
          reserved_count: item.reserved_count ?? 0,
          seen_inventory_count: item.inventory_count,
          inventory_count: Math.max(8, item.inventory_count),
        }
      : { status: "out-of-stock" };
    setBusy(item.candy_id);
    try {
      await api.put(`/sellers/${sellerId}/inventory/${item.candy_id}`, body);
      await Promise.all([reload(), refreshShopPages().catch(() => {})]);
    } catch (e) {
      toast.error(errorText(e));
      await reload();
    } finally {
      setBusy(null);
    }
  }

  const live = (items ?? []).filter((i) => i.candy);
  const inStock = live.filter((i) => i.status !== "out-of-stock").length;

  return (
    <>
      <Panel
        title="Stock and items"
        description={items ? `${inStock} of ${live.length} items on your shelf right now.` : undefined}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => setEditing({ mode: "new" })}
            disabled={shop.status !== "approved"}
            className="rounded-full px-6 font-extrabold"
          >
            Add your own item
          </Button>
          {shop.status !== "approved" && (
            <p className="text-sm text-muted-foreground">You can add your own items once your shop is approved.</p>
          )}
        </div>
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="font-bold text-destructive">
            {errorText(error, "Could not load your stock.")}
          </p>
        ) : !live.length ? (
          <p className="text-muted-foreground">No items yet. Add the snacks you sell.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {live.map((item) => {
              const candy = item.candy!;
              const own = candy.owner_seller_id === sellerId;
              const out = item.status === "out-of-stock";
              return (
                <li
                  key={item.id}
                  aria-label={candy.name}
                  className={cn("flex flex-col gap-3 rounded-md border border-border bg-white p-4 sm:flex-row sm:items-center", out && "opacity-75")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      {own ? "Your item" : "From the catalog"}
                    </p>
                    <h3 className="font-heading text-lg font-extrabold text-cola">{candy.name}</h3>
                    <p className="text-sm text-cola">
                      {money(candy.price_cents)} · {item.inventory_count} left ·{" "}
                      {!!item.reserved_count && <>{item.reserved_count} held in open checkouts · </>}
                      <strong className={out ? "text-destructive" : undefined}>{STOCK_LABEL[item.status]}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={out ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggle(item)}
                      disabled={busy === item.candy_id}
                      className="rounded-full font-bold"
                    >
                      {out ? "Mark in stock" : "Mark out"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(own ? { mode: "own", item } : { mode: "count", item })}
                      className="rounded-full font-bold"
                    >
                      {own ? "Edit" : "Set count"}
                    </Button>
                    {own && (
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(item)} className="rounded-full font-bold text-destructive">
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <ItemDialog editing={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <RemoveDialog item={removing} onClose={() => setRemoving(null)} onRemoved={reload} />
    </>
  );
}
