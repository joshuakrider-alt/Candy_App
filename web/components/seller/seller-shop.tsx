"use client";

import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Me, PublicConfig, Seller } from "@/lib/types";

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
