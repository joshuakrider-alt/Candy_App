"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QtyStepper({
  qty,
  max,
  name,
  onChange,
  className,
}: {
  qty: number;
  max: number;
  name: string;
  onChange: (qty: number) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={`Quantity of ${name}`}
      className={cn("inline-flex h-9 items-center rounded-full border border-border bg-white", className)}
    >
      <button
        type="button"
        aria-label={qty === 1 ? `Remove ${name}` : `One fewer ${name}`}
        onClick={() => onChange(qty - 1)}
        className="flex size-9 items-center justify-center rounded-full text-cola hover:bg-accent"
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-6 text-center font-extrabold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`One more ${name}`}
        disabled={qty >= max}
        onClick={() => onChange(qty + 1)}
        className="flex size-9 items-center justify-center rounded-full text-cola hover:bg-accent disabled:opacity-40"
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
