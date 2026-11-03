"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { CATEGORY_LABELS } from "@/components/shop/product-card";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import { money } from "@/lib/format";
import type { Candy, Category } from "@/lib/types";

const CATEGORIES: Category[] = ["candy", "chips", "drinks"];

/** The shared catalog every shop stocks from (GET /candies), and how it splits by category. */
export function CatalogPanel() {
  const { data: candies, error, isPending } = useQuery({ queryKey: ["candies"], queryFn: () => api.get<Candy[]>("/candies") });

  if (isPending) return <Skeleton className="h-60 w-full" />;
  if (error) {
    return (
      <p role="alert" className="font-bold text-destructive">
        {errorText(error, "Could not load the catalog.")}
      </p>
    );
  }

  const count = (category: Category) => candies.filter((c) => c.category === category).length;
  return (
    <>
      <dl aria-label="Category balance" className="grid grid-cols-3 gap-3">
        {CATEGORIES.map((category) => (
          <div key={category} className="rounded-lg bg-paper/95 p-4 shadow-candy">
            <dt className="text-sm font-bold text-muted-foreground">{CATEGORY_LABELS[category]}</dt>
            <dd className="font-heading text-3xl font-extrabold text-cola">{count(category)}</dd>
          </div>
        ))}
      </dl>
      <Panel
        title="Catalog"
        description={`${candies.length} items any shop can stock. Shops' own items aren't listed here. The category comes from the name.`}
      >
        <ul className="divide-y divide-border text-sm text-cola">
          {candies.map((candy) => (
            <li key={candy.id} className="flex items-baseline justify-between gap-3 py-2">
              <span>
                <span className="font-bold">{candy.name}</span>{" "}
                <span className="text-muted-foreground">· {CATEGORY_LABELS[candy.category]}</span>
              </span>
              <span className="tabular-nums">{money(candy.price_cents)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
