import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-[10px] bg-paper px-3.5 text-base text-ink shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-ink)_16%,transparent)] outline-none placeholder:text-muted focus-visible:shadow-[0_0_0_2px_var(--color-cherry)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
