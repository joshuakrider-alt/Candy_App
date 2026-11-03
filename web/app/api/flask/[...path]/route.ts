import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, clearSessionCookie, flaskUrl } from "@/lib/session";
import { flaskUnreachable, refuseCrossSite } from "@/lib/same-origin";

// The one proxy for every signed-in call. The browser calls /api/flask/<path>;
// this adds the token from the httpOnly cookie and calls FLASK_API_URL/<path>.
// The browser never sees the token or the API address.

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  if (req.method !== "GET") {
    const refused = refuseCrossSite(req);
    if (refused) return refused;
  }

  const headers = new Headers();
  const type = req.headers.get("content-type");
  if (type) headers.set("content-type", type);
  // Flask picks the site to send Stripe buyers back to from this.
  const origin = req.headers.get("origin") ?? req.nextUrl.origin;
  headers.set("origin", origin);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const target = flaskUrl(`/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" ? undefined : await req.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return flaskUnreachable();
  }

  const res = new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  // An expired or revoked token: drop the cookie so the site shows sign-in.
  if (upstream.status === 401) clearSessionCookie(res);
  return res;
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
