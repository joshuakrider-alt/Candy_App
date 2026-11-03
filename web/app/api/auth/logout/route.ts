import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";
import { refuseCrossSite } from "@/lib/same-origin";

export async function POST(req: NextRequest) {
  const refused = refuseCrossSite(req);
  if (refused) return refused;
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookie(res);
  return res;
}
