import { cn } from "@/lib/utils";

/**
 * The shop's chosen title ("Candy Lady", "Candy Shop", ...) as a small label
 * next to its name. Renders nothing for a payload from before titles existed.
 */
export function ShopTitle({ title, className }: { title?: string | null; className?: string }) {
  if (!title) return null;
  return (
    <span
      className={cn(
        "inline-block rounded-full bg-lemon/70 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-cola",
        className,
      )}
    >
      {title}
    </span>
  );
}
