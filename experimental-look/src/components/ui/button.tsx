import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[transform,background-color,opacity] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cherry disabled:pointer-events-none disabled:opacity-45 active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        primary: "bg-cherry text-cream hover:bg-cherry-deep",
        cola: "bg-cola text-cream hover:bg-cola/90",
        secondary:
          "bg-paper text-ink shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-ink)_12%,transparent)] hover:bg-foam",
        ghost: "bg-transparent text-ink hover:bg-ink/5",
      },
      size: {
        default: "min-h-11 rounded-full px-5 text-sm",
        compact: "min-h-10 rounded-full px-4 text-sm",
        lg: "min-h-12 rounded-full px-6 text-base",
        icon: "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
