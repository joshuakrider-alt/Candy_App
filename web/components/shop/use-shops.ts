"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShopSummary } from "@/lib/flask";

// Render's free tier can take most of a minute to wake. These retries cover
// about 75 seconds before the page gives up and offers a "Try again" button.
const RETRIES = 6;
const retryDelay = (attempt: number) => Math.min(2_000 * 2 ** attempt, 20_000);

export type ShopsState =
  | { status: "loading"; slow: boolean }
  | { status: "error"; retry: () => void }
  | { status: "ready"; shops: ShopSummary[] };

/**
 * The shop list, known or still on its way.
 *
 * The home page and /shops are cached and rendered on the server. When the
 * server could not reach the API while building that copy (Render asleep at
 * deploy time), it passes `null` rather than an empty list, and the browser
 * fetches the list itself. Only a list that actually arrived counts as
 * "ready", so an API that is slow or down never looks like "no shops".
 */
export function useShops(initial: ShopSummary[] | null): ShopsState {
  const query = useQuery({
    queryKey: ["public-shops"],
    queryFn: () => api.get<ShopSummary[]>("/shops"),
    enabled: initial === null,
    retry: RETRIES,
    retryDelay,
    staleTime: 30_000,
  });

  if (initial !== null) return { status: "ready", shops: initial };
  if (query.data) return { status: "ready", shops: query.data };
  if (query.isError) return { status: "error", retry: () => void query.refetch() };
  // After the first failed try, say why it is taking a while.
  return { status: "loading", slow: query.failureCount > 0 };
}
