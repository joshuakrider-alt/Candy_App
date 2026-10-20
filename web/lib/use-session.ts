"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/api";

export const SESSION_QUERY_KEY = ["session"] as const;

/** The signed-in user (or null) for client components such as the header. */
export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: auth.session, staleTime: 60_000 });
}

export function useRefreshSession() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
}
