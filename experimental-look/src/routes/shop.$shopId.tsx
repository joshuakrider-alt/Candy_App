import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Clock, MapPin, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductTile } from "@/components/product-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/candy/cart";
import { getShop } from "@/lib/candy/server";
import type { InventoryItem, ShopCard } from "@/lib/candy/types";

export const Route = createFileRoute("/shop/$shopId")({ component: ShopPage });

const CATS = ["all", "candy", "chips", "drinks"] as const;

function ShopPage() {
  const { shopId } = Route.useParams();
  const id = Number(shopId);
  const [data, setData] = useState<{ shop: ShopCard; items: InventoryItem[] } | null | undefined>(
    undefined,
  );
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");
  const add = useCart((s) => s.add);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setData(null);
      return;
    }
    void getShop({ data: { shopId: id } }).then(setData);
  }, [id]);

  const items = useMemo(() => {
    if (!data) return [];
    const onShelf = data.items.filter((item) => item.inventoryCount > 0);
    if (cat === "all") return onShelf;
    return onShelf.filter((item) => item.category === cat);
  }, [data, cat]);

  if (data === undefined) {
    return (
      <main className="grid gap-4">
        <Skeleton className="h-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-72" />
          ))}
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="rounded-[22px] bg-paper p-6 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-3xl font-extrabold">Shop not found</h1>
        <p className="mt-2 text-muted">That snack spot isn’t on the live list.</p>
        <Link to="/shop" className="mt-4 inline-block font-bold text-cherry">
          Back to shops
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <section className="grid overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-card)] md:grid-cols-[1.1fr_0.9fr]">
        {data.shop.photoPath ? (
          <img
            src={data.shop.photoPath}
            alt=""
            className="media h-56 w-full object-cover sm:h-72 md:h-full md:min-h-[280px] md:max-h-[360px]"
          />
        ) : (
          <div className="h-56 bg-foam sm:h-72" />
        )}
        <div className="flex flex-col gap-3 p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-cherry">
            {data.shop.neighborhood}
          </p>
          <h1 className="font-display text-4xl font-extrabold">{data.shop.shopName}</h1>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Clock className="size-4" />
            {data.shop.pickupWindow}
          </p>
          <p className="flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-4" />
            Pickup from {data.shop.contactName}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.shop.identityVerified ? (
              <Badge variant="mint" className="w-fit">
                <ShieldCheck className="mr-1 size-3.5" />
                ID verified seller
              </Badge>
            ) : null}
            {data.shop.chargesEnabled ? (
              <Badge variant="paper" className="w-fit">
                Paid straight to this seller
              </Badge>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {CATS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCat(item)}
            className={cn(
              "min-h-10 rounded-full px-4 text-sm font-bold capitalize",
              cat === item ? "bg-cherry text-cream" : "bg-foam text-ink",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ProductTile
            key={item.id}
            item={item}
            onAdd={() => {
              const { switched } = add({
                shopId: data.shop.id,
                shopName: data.shop.shopName,
                catalogId: item.id,
                name: item.name,
                imagePath: item.imagePath,
                priceCents: item.priceCents,
                max: item.inventoryCount,
              });
              toast.success(
                switched ? `Bag switched to ${data.shop.shopName}` : `Added ${item.name}`,
              );
            }}
          />
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-sm font-bold text-muted">Nothing in this aisle right now.</p>
      ) : null}
    </main>
  );
}
