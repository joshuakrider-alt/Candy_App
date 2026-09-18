import { ArrowDown, Banknote, Store } from "lucide-react";
import { formatCents, type MoneySplit } from "@/lib/candy/money";
import { cn } from "@/lib/utils";

export function MoneyFlow({
  split,
  sellerName,
  compact = false,
}: {
  split: MoneySplit;
  sellerName: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", compact ? "text-sm" : "")}>
      <div className="flex items-center justify-between rounded-[16px] bg-cola px-4 py-3 text-cream">
        <span className="font-bold">Buyer pays</span>
        <span className="font-display text-xl font-extrabold tabular-nums">
          {formatCents(split.subtotalCents)}
        </span>
      </div>
      <div className="flex justify-center text-muted">
        <ArrowDown className="size-4" />
      </div>
      <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">
        Charged on the seller’s Stripe · we never hold it
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <FlowTile
          icon={Store}
          label={`${sellerName} bank`}
          value={formatCents(split.sellerNetCents)}
          hint="Payout in 2 business days"
          emphasis
        />
        <FlowTile
          label="Candy Lady fee"
          value={formatCents(split.applicationFeeCents)}
          hint="10% application fee"
        />
        <FlowTile
          icon={Banknote}
          label="Stripe processing"
          value={formatCents(split.stripeFeeCents)}
          hint="2.9% + 30¢ + 0.25% Connect"
        />
      </div>
    </div>
  );
}

function FlowTile({
  icon: Icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon?: typeof Store;
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] px-3 py-3",
        emphasis ? "bg-mint/12 text-ink" : "bg-foam text-ink",
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p>
    </div>
  );
}
