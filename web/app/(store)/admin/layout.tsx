import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { Panel } from "@/components/panel";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: { template: "%s · Admin", default: "Admin" }, robots: { index: false } };

// middleware.ts already sends visitors without a cookie to /login. This shows
// everyone but an admin a plain "not for you" screen; Flask checks the role on
// every admin call regardless.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect("/login?next=/admin");
  if (me.user.role !== "admin") {
    return (
      <Panel title="Admins only" className="mx-auto max-w-xl">
        <p className="text-cola">This page is for the people who run The Candy Lady.</p>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-bold text-cherry-deep">Admin</p>
        <h1 className="text-4xl font-extrabold text-cola">Running The Candy Lady</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
        <DashboardNav area="admin" />
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
