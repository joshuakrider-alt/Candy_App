import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account/account-settings";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const me = await getSession();
  if (!me) redirect("/login?next=/account");
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-extrabold text-cola">Your account</h1>
        <Link href="/account/orders" className="font-bold text-cherry-deep underline">
          Your orders
        </Link>
      </div>
      <AccountSettings user={me.user} />
    </>
  );
}
