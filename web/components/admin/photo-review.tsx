"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { RemoteImage } from "@/components/remote-image";
import { usePublicConfig } from "@/components/seller/seller-shop";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import type { ReviewPhoto } from "@/lib/types";

const KEY = ["admin-photos", "pending"];

function PhotoCard({ photo, onDone }: { photo: ReviewPhoto; onDone: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function review(status: "approved" | "rejected") {
    setBusy(true);
    try {
      await api.put(`/admin/photos/${photo.id}`, { status, rejection_reason: status === "rejected" ? reason.trim() : undefined });
      toast.success(status === "approved" ? "Photo approved." : "Photo rejected.");
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "That review did not save."));
      setBusy(false);
    }
  }

  return (
    <li aria-label={`Photo from ${photo.shop_name ?? "unknown shop"}`} className="flex flex-col gap-2 rounded-md border border-border bg-white p-3">
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        {photo.url ? (
          <RemoteImage src={photo.url} alt={photo.caption ?? "Photo waiting for review"} fill sizes="300px" className="object-cover" />
        ) : (
          <p className="p-3 text-sm text-muted-foreground">Image unavailable</p>
        )}
      </div>
      <p className="font-bold text-cola">{photo.shop_name ?? "Unknown shop"}</p>
      {photo.caption && <p className="text-sm text-cola">{photo.caption}</p>}
      <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
        Reason, if you reject it (the seller sees this)
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="h-9 bg-white" />
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => review("approved")} disabled={busy} className="rounded-full font-extrabold">
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => review("rejected")} disabled={busy} className="rounded-full font-bold">
          Reject
        </Button>
      </div>
    </li>
  );
}

/** Seller photos waiting for review (GET /admin/photos). Nothing is public until approved here. */
export function PhotoReview() {
  const client = useQueryClient();
  const { data: config, isPending: configPending } = usePublicConfig();
  const { data: photos, error, isPending } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ReviewPhoto[]>("/admin/photos?status=pending"),
    enabled: !!config?.uploads_enabled,
  });

  if (configPending) return <Skeleton className="h-40 w-full" />;
  if (!config?.uploads_enabled) return <Panel title="Photo review" description="Photo uploads aren't switched on for this site yet." />;

  return (
    <Panel title="Photo review" description="Check each photo shows snacks and nothing personal (faces of children, house numbers, street signs).">
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p role="alert" className="font-bold text-destructive">
          {errorText(error, "Could not load photos.")}
        </p>
      ) : !photos.length ? (
        <p className="text-muted-foreground">Nothing waiting.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} onDone={() => client.invalidateQueries({ queryKey: KEY })} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
