"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/api";

export const SESSION_QUERY_KEY = ["session"] as const;

/** The signed-in user (or null) for client components such as the header. */
export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: auth.session, staleTime: 60_000 });
}

/**
 * Call after every sign-in, sign-up and sign-out. The query cache outlives
 * those (it sits in the root layout), so everything cached for the last
 * account is dropped here: otherwise the next person on the same device could
 * be shown its orders, receipts and pickup addresses straight from the cache.
 */
export function useRefreshSession() {
  const client = useQueryClient();
  return () => {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] });
    return client.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };
}
