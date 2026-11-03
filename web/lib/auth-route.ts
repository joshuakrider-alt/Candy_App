import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { flaskUrl, setSessionCookie } from "@/lib/session";
import { flaskUnreachable, readFlaskJson, refuseCrossSite } from "@/lib/same-origin";

/**
 * Shared body of /api/auth/login and /api/auth/signup: forward the listed
 * fields to Flask, keep the access token in the httpOnly cookie, and hand the
 * browser only `user`.
 */
export async function exchangeForSession(
  req: NextRequest,
  flaskPath: "/login" | "/signup",
  fields: readonly string[],
) {
  const refused = refuseCrossSite(req);
  if (refused) return refused;

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "send the form as JSON" }, { status: 400 });
  }
  const body = Object.fromEntries(fields.map((f) => [f, input[f]]));

  let res: Response;
  try {
    res = await fetch(flaskUrl(flaskPath), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return flaskUnreachable();
  }
  const data = await readFlaskJson(res);
  if (!res.ok || typeof data.access_token !== "string") {
    return NextResponse.json({ error: data.error ?? "sign-in failed" }, { status: res.ok ? 502 : res.status });
  }

  const out = NextResponse.json({ user: data.user }, { status: res.status });
  setSessionCookie(out, data.access_token);
  return out;
}
