"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UnreadCount } from "@/lib/types";
import { useSession } from "@/lib/use-session";

export const UNREAD_QUERY_KEY = ["messages", "unread"] as const;

/** Unread messages for the signed-in visitor, checked every minute. 0 when signed out. */
export function useUnreadCount() {
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const { data } = useQuery({
    queryKey: UNREAD_QUERY_KEY,
    queryFn: () => api.get<UnreadCount>("/messages/unread"),
    enabled: signedIn,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
  return signedIn ? (data?.unread ?? 0) : 0;
}

export function useRefreshMessages() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["messages"] });
}

/** "3" or "9+", for a badge. */
export function badgeText(count: number) {
  return count > 9 ? "9+" : String(count);
}

/** Flask stores naive UTC; this reads it as UTC and prints it locally. */
export function when(iso: string | null) {
  if (!iso) return "";
  const date = new Date(`${iso}Z`);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
