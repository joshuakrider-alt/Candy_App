import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { Panel } from "@/components/panel";
import { SellerShopProvider } from "@/components/seller/seller-shop";
import { getSession } from "@/lib/session";
import { ShopTitle } from "@/components/shop/shop-title";

export const metadata: Metadata = { title: { template: "%s · Seller", default: "Seller" }, robots: { index: false } };

// middleware.ts already sends visitors without a cookie to /login. This also
// shows the right screen to buyers and to accounts with no shop. It is only
// about the screen: Flask checks the role and shop on every call.
export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const me = await getSession();
  if (!me) redirect("/login?next=/seller");

  if (me.user.role !== "seller" && me.user.role !== "admin") {
    return (
      <Panel title="This account isn't a seller" className="mx-auto max-w-xl">
        <p className="text-cola">
          You&apos;re signed in as a buyer. To run a shop,{" "}
          <Link href="/sell/apply" className="font-bold text-cherry-deep underline">
            apply to sell
          </Link>{" "}
          with a separate email.
        </p>
      </Panel>
    );
  }

  if (!me.seller) {
    return (
      <Panel title="No shop linked" className="mx-auto max-w-xl">
        <p className="text-cola">
          This account is not linked to a shop. An admin can link it with <code>manage.py set-role</code>.
        </p>
      </Panel>
    );
  }

  const { seller } = me;
  return (
    <SellerShopProvider seller={seller}>
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-bold text-cherry-deep">Seller dashboard</p>
          <h1 className="text-4xl font-extrabold text-cola">{seller.shop_name}</h1>
          <ShopTitle title={seller.shop_title} className="mt-1" />
        </div>
        {seller.status !== "approved" && (
          <p
            role="status"
            className={
              seller.status === "pending"
                ? "rounded-lg bg-lemon/70 p-4 font-bold text-cola"
                : "rounded-lg bg-destructive/10 p-4 font-bold text-destructive"
            }
          >
            {seller.status === "pending"
              ? "Your shop is waiting for approval. Buyers can't see it yet, but you can set up your stock, shop page and payouts now."
              : "This shop was not approved. Contact us at the address on the contact page if you think that's a mistake."}
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-[13rem_1fr]">
          <DashboardNav area="seller" />
          <div className="flex min-w-0 flex-col gap-5">{children}</div>
        </div>
      </div>
    </SellerShopProvider>
  );
}
