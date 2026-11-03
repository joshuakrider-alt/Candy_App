"use client";

import type { Line } from "@/store/cart";

// What the old static site (app.js) kept in localStorage. Read once on the
// new site's first load; the cart keys are then kept in step with the new
// cart, so moving the domain back to the old site during the 7-day rollback
// window does not empty anyone's cart.
//
// Remove this file in the post-cutover clean-up, together with the old site.

const OLD_CART = "candyLadyCart";
const OLD_SELLER = "candyLadySellerId";
/** The old site's login and API override: never trusted, always deleted. */
const OLD_SESSION_KEYS = ["candyLadyToken", "candyLadyUser", "candyLadyApiBase"];

type OldLine = { id: string; name: string; priceCents: number; qty: number };

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export function forgetOldSession() {
  try {
    OLD_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing to forget.
  }
}

/** The old site's cart, if it left one: its shop id and lines. */
export function readOldCart(): { sellerId: number; lines: Line[] } | null {
  const saved = read<OldLine[]>(OLD_CART);
  const sellerId = Number(read<number | string>(OLD_SELLER));
  if (!Array.isArray(saved) || !saved.length || !Number.isInteger(sellerId) || sellerId <= 0) return null;
  const lines = saved
    .map((item) => ({
      candyId: Number(item.id),
      name: String(item.name ?? ""),
      priceCents: Number(item.priceCents),
      qty: Number(item.qty),
      // The old cart did not record stock. The shop page lowers this to the
      // real count when the buyer opens it, and Flask checks again at checkout.
      max: Number(item.qty),
    }))
    .filter((l) => Number.isInteger(l.candyId) && l.candyId > 0 && l.qty > 0 && Number.isFinite(l.priceCents));
  return lines.length ? { sellerId, lines } : null;
}

/** Mirrors the new cart into the old site's keys, in the old site's format. */
export function writeOldCart(sellerId: number | null, lines: Line[]) {
  try {
    if (!sellerId || !lines.length) {
      localStorage.removeItem(OLD_CART);
      localStorage.removeItem(OLD_SELLER);
      return;
    }
    const old: OldLine[] = lines.map((l) => ({
      id: String(l.candyId),
      name: l.name,
      priceCents: l.priceCents,
      qty: l.qty,
    }));
    localStorage.setItem(OLD_CART, JSON.stringify(old));
    localStorage.setItem(OLD_SELLER, JSON.stringify(sellerId));
  } catch {
    // Storage full or blocked; the new cart is unaffected.
  }
}
