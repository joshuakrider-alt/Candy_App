import { NextRequest, NextResponse } from "next/server";

/**
 * Refuses a write whose Origin is not this site. SameSite=Lax already keeps the
 * session cookie off cross-site POST, PUT and DELETE; this is the second lock.
 * A request with no Origin at all is refused too, since every browser sends
 * one on a cross-origin or non-GET fetch.
 */
export function refuseCrossSite(req: NextRequest): NextResponse | null {
  if (req.headers.get("origin") === req.nextUrl.origin) return null;
  return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
}

/**
 * Reads Flask's JSON body, or turns an HTML error page (Render's own, when the
 * service is restarting) into the usual {"error": "..."} shape.
 */
export async function readFlaskJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return { error: "The shop's server did not answer properly. Try again in a moment." };
  }
}

/** Flask could not be reached at all: usually Render's free tier waking up. */
export function flaskUnreachable() {
  return NextResponse.json(
    { error: "Waking up the shop, one moment. Try again in a few seconds." },
    { status: 503 },
  );
}
