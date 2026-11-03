import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, clearSessionCookie, flaskUrl } from "@/lib/session";
import { flaskUnreachable } from "@/lib/same-origin";

// Who is signed in, for the header's account menu. It answers {user: null}
// straight away when there is no cookie, so a signed-out visitor never wakes
// the Render API just to draw the header.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  let res: Response;
  try {
    res = await fetch(flaskUrl("/me"), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return flaskUnreachable();
  }
  if (res.status === 401) {
    const out = NextResponse.json({ user: null });
    clearSessionCookie(out);
    return out;
  }
  if (!res.ok) return NextResponse.json({ error: "could not load your account" }, { status: 502 });
  return NextResponse.json(await res.json());
}
