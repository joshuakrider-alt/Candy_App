import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// middleware.ts already sends visitors without a cookie to /login; this also
// catches a cookie whose token Flask no longer accepts. Reading the session
// makes these pages render per request, which the nonce policy needs.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect("/login?next=/account");
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">{children}</div>;
}
