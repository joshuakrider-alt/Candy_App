import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-[16px] bg-foam", className)}
      {...props}
    />
  );
}

export { Skeleton };
