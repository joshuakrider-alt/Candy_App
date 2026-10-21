"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/api";

export const SESSION_QUERY_KEY = ["session"] as const;

/** The signed-in user (or null) for client components such as the header. */
export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: auth.session, staleTime: 60_000 });
}

/**
 * Call after signing in or out (or anything else that changes who is signed
 * in). Every other cached query is dropped, so nothing private to the last
 * person (their orders and pickup codes, their shop) shows for the next one,
 * even for a moment; pages load their data afresh.
 */
export function useRefreshSession() {
  const client = useQueryClient();
  return () => {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] });
    return client.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };
}
