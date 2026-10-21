"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage, Panel } from "@/components/panel";
import { errorText } from "@/lib/error-text";
import { usePublicConfig } from "@/components/seller/seller-shop";
import { api } from "@/lib/api";
import type { IdentityState, IdentityStatus } from "@/lib/types";

const LABELS: Record<IdentityStatus, string> = {
  unstarted: "Not started",
  processing: "Stripe is checking…",
  requires_input: "Needs another try",
  verified: "Verified",
  canceled: "Cancelled",
};

const KEY = ["identity"];

/**
 * Stripe Identity check of the person behind the shop. Stripe sends them back
 * to /seller.html?identity=return, which next.config.ts redirects here.
 */
export function IdentityPanel() {
  const client = useQueryClient();
  const { data: config, isPending: configPending } = usePublicConfig();
  const { data: state, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<IdentityState>("/identity/status"),
    enabled: !!config?.identity_enabled,
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledReturn = useRef(false);

  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("identity") !== "return") return;
    url.searchParams.delete("identity");
    window.history.replaceState(null, "", url.pathname + url.search);
    // The webhook may not have arrived yet, so ask Flask to read the verdict now.
    setNote("Checking your verification…");
    api
      .post<IdentityState>("/identity/refresh")
      .then((fresh) => {
        client.setQueryData(KEY, fresh);
        setNote(null);
      })
      .catch((e) => {
        setNote(null);
        setError(errorText(e, "Could not check your verification."));
      });
  }, [client]);

  async function start() {
    setBusy(true);
    setError(null);
    setNote("Opening Stripe…");
    try {
      const payload = await api.post<IdentityState>("/identity/session");
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      client.setQueryData(KEY, payload);
      setNote(null);
    } catch (e) {
      setNote(null);
      setError(errorText(e, "Verification could not start."));
    }
    setBusy(false);
  }

  if (configPending) return <Skeleton className="h-40 w-full" />;
  if (!config?.identity_enabled) {
    return <Panel title="ID check" description="ID checks aren't switched on for this site yet. Nothing to do here for now." />;
  }

  return (
    <Panel
      title="ID check"
      description="A quick check with Stripe that you are who you say you are. Buyers see an “ID verified” badge on your shop; they never see your ID."
    >
      <div className="flex flex-col gap-4">
        {state ? (
          <>
            <p className="text-lg font-extrabold text-cola">{LABELS[state.identity_status] ?? state.identity_status}</p>
            {state.identity_error && <p className="text-sm text-cola">{state.identity_error}</p>}
            {!state.identity_verified && (
              <Button onClick={start} disabled={busy} className="self-start rounded-full px-6 font-extrabold">
                {state.identity_status === "unstarted" ? "Verify with Stripe" : "Try verification again"}
              </Button>
            )}
          </>
        ) : loadError ? (
          <p role="alert" className="font-bold text-destructive">
            {errorText(loadError, "Could not load your verification.")}
          </p>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
        <FormMessage>{note}</FormMessage>
        <FormMessage error>{error}</FormMessage>
      </div>
    </Panel>
  );
}
