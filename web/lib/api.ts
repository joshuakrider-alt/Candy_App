"use client";

import type { ApiError, Me, User } from "@/lib/types";

/** A failed call, carrying Flask's own message and the HTTP status. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiRequestError("You seem to be offline. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Partial<ApiError>;
  if (!res.ok) throw new ApiRequestError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Browser calls to Flask, through the /api/flask proxy that adds the session. */
export const api = {
  get: <T>(path: string) => send<T>(`/api/flask${path}`),
  post: <T>(path: string, body?: unknown) =>
    send<T>(`/api/flask${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    send<T>(`/api/flask${path}`, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string, body?: unknown) =>
    send<T>(`/api/flask${path}`, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

/** Signing in and out, which only the site's own /api/auth routes do. */
export const auth = {
  session: () => send<Partial<Me> & { user: User | null }>("/api/auth/session"),
  login: (email: string, password: string) =>
    send<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (name: string, email: string, password: string) =>
    send<{ user: User }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => send<void>("/api/auth/logout", { method: "POST" }),
};

/** Where a user lands after signing in when no `next` page was asked for. */
export function homeFor(user: Pick<User, "role">) {
  if (user.role === "admin") return "/admin";
  if (user.role === "seller") return "/seller";
  return "/shops";
}

/**
 * A `next` value that is safe to redirect to: a path on this site only.
 * Anything else ("//evil.example", "https://...", "/\\evil") is dropped.
 */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
