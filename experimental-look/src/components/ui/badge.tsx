import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide",
  {
    variants: {
      variant: {
        cream: "bg-foam text-ink",
        cherry: "bg-cherry text-cream",
        mint: "bg-mint/15 text-mint",
        paper: "bg-paper text-ink shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-ink)_10%,transparent)]",
      },
    },
    defaultVariants: { variant: "cream" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
