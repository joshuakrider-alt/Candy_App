import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[28px] bg-paper p-5 shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export { Card };
