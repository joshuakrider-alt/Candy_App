"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage, Panel } from "@/components/seller/panel";
import { errorText, usePublicConfig, useSellerId, useSellerShop, useSetSellerShop } from "@/components/seller/seller-shop";
import { RemoteImage } from "@/components/remote-image";
import { api } from "@/lib/api";
import type { InventoryItem, PhotoStatus, Seller, SellerPhoto } from "@/lib/types";
import { uploadImage } from "@/lib/upload";

const STATUS: Record<PhotoStatus, string> = {
  pending: "Waiting on review",
  approved: "Live on your shop",
  rejected: "Not accepted",
};

const field = "flex flex-col gap-1.5 text-sm font-bold text-cola";

function ProfilePhoto() {
  const sellerId = useSellerId();
  const shop = useSellerShop();
  const setShop = useSetSellerShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, "profile_photo");
      setShop(await api.put<Seller>(`/sellers/${sellerId}/profile-photo`, uploaded));
      toast.success("Uploaded. We'll review it shortly.");
    } catch (e) {
      setError(errorText(e, "That upload did not work."));
    } finally {
      setBusy(false);
      input.value = "";
    }
  }

  // A shop with no photo also reads "pending" (the column's default), so
  // pending can't be told apart from "never uploaded" and gets a line that
  // fits both.
  const status = shop.profile_photo_url ? "approved" : shop.profile_photo_status;
  const label =
    status === "approved"
      ? STATUS.approved
      : status === "rejected"
        ? STATUS.rejected
        : "No photo live yet. If you've sent one, we're reviewing it.";
  return (
    <Panel title="Your photo" description="The face buyers see on your shop page. Not the photo from your ID check.">
      <div className="flex flex-col gap-3">
        <p className="font-bold text-cola">{label}</p>
        <label className={field}>
          Choose a photo
          <Input type="file" accept="image/*" onChange={upload} disabled={busy} className="h-11 bg-white" />
        </label>
        <FormMessage>{busy ? "Uploading your photo…" : null}</FormMessage>
        <FormMessage error>{error}</FormMessage>
      </div>
    </Panel>
  );
}

function SnackPhotos() {
  const sellerId = useSellerId();
  const client = useQueryClient();
  const key = ["seller-photos", sellerId];
  const { data: photos, error: loadError, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api.get<SellerPhoto[]>(`/sellers/${sellerId}/photos`),
  });
  const { data: items } = useQuery({
    queryKey: ["seller-inventory", sellerId],
    queryFn: () => api.get<InventoryItem[]>(`/sellers/${sellerId}/inventory`),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => client.invalidateQueries({ queryKey: key });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a photo first.");
      return;
    }
    const candyId = String(data.get("candy_id") ?? "");
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, "candy_photo");
      await api.post(`/sellers/${sellerId}/photos`, {
        ...uploaded,
        caption: String(data.get("caption") ?? "").trim(),
        candy_id: candyId ? Number(candyId) : null,
      });
      form.reset();
      toast.success("Uploaded. We'll review it shortly.");
      await reload();
    } catch (e) {
      setError(errorText(e, "That upload did not work."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: SellerPhoto) {
    try {
      await api.delete(`/sellers/${sellerId}/photos/${photo.id}`);
      await reload();
    } catch (e) {
      toast.error(errorText(e, "That photo could not be removed."));
    }
  }

  return (
    <Panel
      title="Snack photos"
      description="Photos of what's on your shelf. We check each one before buyers see it. Location data from your phone is removed before upload."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className={field}>
          Photo
          <Input ref={fileRef} name="photo" type="file" accept="image/*" disabled={busy} className="h-11 bg-white" />
        </label>
        <label className={field}>
          Which item is it? (optional)
          <select name="candy_id" defaultValue="" className="h-11 rounded-lg border border-input bg-white px-3 text-sm">
            <option value="">A shelf photo, not one item</option>
            {(items ?? [])
              .filter((i) => i.candy)
              .map((i) => (
                <option key={i.candy_id} value={i.candy_id}>
                  {i.candy!.name}
                </option>
              ))}
          </select>
        </label>
        <label className={field}>
          Caption (optional)
          <Input name="caption" maxLength={200} className="h-11 bg-white" />
        </label>
        <FormMessage>{busy ? "Uploading photo…" : null}</FormMessage>
        <FormMessage error>{error}</FormMessage>
        <Button type="submit" disabled={busy} className="self-start rounded-full px-6 font-extrabold">
          Upload photo
        </Button>
      </form>

      <div className="mt-6">
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : loadError ? (
          <p role="alert" className="font-bold text-destructive">
            {errorText(loadError, "Could not load your photos.")}
          </p>
        ) : !photos.length ? (
          <p className="text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-2 rounded-md border border-border bg-white p-2">
                <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {photo.url ? (
                    <RemoteImage src={photo.url} alt={photo.caption ?? "Snack photo"} fill sizes="200px" className="object-cover" />
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">Image unavailable</p>
                  )}
                </div>
                <p className="text-sm font-bold text-cola">{STATUS[photo.status]}</p>
                {photo.rejection_reason && <p className="text-xs text-destructive">{photo.rejection_reason}</p>}
                <Button variant="ghost" size="sm" onClick={() => remove(photo)} className="self-start font-bold text-destructive">
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/** Profile and snack photos, uploaded straight to storage (lib/upload.ts). */
export function PhotosPanel() {
  const { data: config, isPending } = usePublicConfig();
  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!config?.uploads_enabled) {
    return <Panel title="Photos" description="Photo uploads aren't switched on for this site yet." />;
  }
  return (
    <>
      <ProfilePhoto />
      <SnackPhotos />
    </>
  );
}
