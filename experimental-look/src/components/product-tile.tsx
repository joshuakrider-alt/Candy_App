import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/candy/money";
import type { InventoryItem } from "@/lib/candy/types";

export function ProductTile({
  item,
  onAdd,
  disabled,
}: {
  item: InventoryItem;
  onAdd?: () => void;
  disabled?: boolean;
}) {
  const out = item.stock === "out-of-stock";
  return (
    <article className="flex flex-col overflow-hidden rounded-[22px] bg-paper shadow-[var(--shadow-card)]">
      <div className="relative aspect-square overflow-hidden bg-foam">
        <img src={item.imagePath} alt="" className="media size-full object-cover" />
        {item.stock === "low-stock" ? (
          <Badge className="absolute left-3 top-3" variant="cherry">
            Low stock
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-extrabold leading-none">{item.name}</h3>
            <p className="mt-1 text-sm text-muted">{item.description}</p>
          </div>
          <span className="rounded-full bg-foam px-2.5 py-1 text-sm font-extrabold tabular-nums">
            {formatCents(item.priceCents)}
          </span>
        </div>
        {onAdd ? (
          <Button
            className="mt-auto"
            variant={out ? "secondary" : "primary"}
            disabled={disabled || out}
            onClick={onAdd}
          >
            {out ? "Out of stock" : "Add to bag"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
