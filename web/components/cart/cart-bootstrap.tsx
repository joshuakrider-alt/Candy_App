"use client";

import { useEffect } from "react";
import { useCart, useCartReady } from "@/store/cart";
import { forgetOldSession, readOldCart, writeOldCart } from "@/store/legacy-storage";

/**
 * Loads the saved cart after the first render, carries over a cart left by
 * the old site, deletes the old site's login keys, and keeps the old cart
 * keys in step for the rollback window. Renders nothing.
 */
export function CartBootstrap() {
  useEffect(() => {
    let unsubscribe = () => {};
    Promise.resolve(useCart.persist.rehydrate()).then(() => {
      forgetOldSession();
      if (!useCart.getState().lines.length) {
        const old = readOldCart();
        if (old) useCart.setState({ sellerId: old.sellerId, shopName: null, shopSlug: null, lines: old.lines });
      }
      const mirror = () => writeOldCart(useCart.getState().sellerId, useCart.getState().lines);
      mirror();
      unsubscribe = useCart.subscribe(mirror);
      useCartReady.setState({ ready: true });
    });
    return () => unsubscribe();
  }, []);
  return null;
}
