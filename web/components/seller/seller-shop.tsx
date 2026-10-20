"use client";

import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError, api } from "@/lib/api";
import type { Me, PublicConfig, Seller } from "@/lib/types";
import { sentence } from "@/components/orders/use-order-actions";

const SellerIdContext = createContext<number | null>(null);
const InitialShopContext = createContext<Seller | null>(null);

export const SHOP_QUERY_KEY = ["seller-shop"] as const;

/** Hands the signed-in seller's shop, read by the server layout, to the seller pages. */
export function SellerShopProvider({ seller, children }: { seller: Seller; children: React.ReactNode }) {
  return (
    <SellerIdContext.Provider value={seller.id}>
      <InitialShopContext.Provider value={seller}>{children}</InitialShopContext.Provider>
    </SellerIdContext.Provider>
  );
}

export function useSellerId() {
  const id = useContext(SellerIdContext);
  if (id === null) throw new Error("useSellerId outside SellerShopProvider");
  return id;
}

/** The shop as GET /me reports it (owner fields included), kept fresh after edits. */
export function useSellerShop() {
  const initial = useContext(InitialShopContext);
  const { data } = useQuery({
    queryKey: SHOP_QUERY_KEY,
    queryFn: async () => (await api.get<Me>("/me")).seller ?? null,
    initialData: initial,
    staleTime: 30_000,
  });
  return data ?? initial!;
}

export function useSetSellerShop() {
  const client = useQueryClient();
  return (seller: Seller) => client.setQueryData(SHOP_QUERY_KEY, seller);
}

/** GET /config, which says whether photo uploads and ID checks are switched on. */
export function usePublicConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api.get<PublicConfig>("/config"), staleTime: 5 * 60_000 });
}

/** Flask's error as a sentence, or a fallback. */
export function errorText(error: unknown, fallback = "Something went wrong. Try again.") {
  // Flask's 503s name its own environment variables, which mean nothing to a seller.
  if (error instanceof ApiRequestError && error.status === 503 && /not configured/i.test(error.message)) {
    return "That isn't switched on for this site yet.";
  }
  if (error instanceof ApiRequestError) return sentence(error.message);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
