import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Me } from "@/lib/types";

// `__Host-` makes the browser refuse the cookie unless it is Secure, has
// Path=/ and no Domain, so no subdomain can set or read it. Local `next dev`
// runs on plain http, where that prefix would be refused, so it uses a plain
// name instead.
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-cl_session" : "cl_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // matches JWT_ACCESS_TOKEN_HOURS

/** The Flask API's base URL. Only ever read from the server's environment. */
export function flaskUrl(path: string) {
  const base = process.env.FLASK_API_URL;
  if (!base) throw new Error("FLASK_API_URL is not set");
  return `${base.replace(/\/+$/, "")}${path}`;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE });
}

/**
 * Signs the browser out. The expiring cookie must carry the same attributes
 * as the one being replaced: browsers ignore a `__Host-` cookie set without
 * Secure and Path=/, so a bare cookies.delete() would leave the session alive.
 */
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

/**
 * The signed-in user, from Flask's GET /me, or null. Only Flask decides
 * whether a token is valid; this never decodes it.
 */
export async function getSession(): Promise<Me | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(flaskUrl("/me"), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as Me) : null;
  } catch {
    // Flask unreachable (Render asleep or down) reads as signed out.
    return null;
  }
}
