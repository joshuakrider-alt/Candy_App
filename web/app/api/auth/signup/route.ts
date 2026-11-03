import { NextRequest } from "next/server";
import { exchangeForSession } from "@/lib/auth-route";

export async function POST(req: NextRequest) {
  return exchangeForSession(req, "/signup", ["name", "email", "password"]);
}
