import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ShopsState } from "@/components/shop/use-shops";

/** Placeholder cards while the shop list is on its way. */
export function ShopsLoading({ slow, count = 3 }: { slow: boolean; count?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4" data-testid="shops-loading">
      <p className="text-sm font-bold text-muted-foreground">
        Loading shops...
        {slow && " The shop server is waking up, which can take up to a minute."}
      </p>
      <ul aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-lg bg-paper/95 p-5 shadow-candy">
            <div className="flex items-start gap-3">
              <Skeleton className="size-14 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The list could not be fetched. Deliberately not worded as "no shops". */
export function ShopsUnavailable({ retry }: Extract<ShopsState, { status: "error" }>) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-paper/90 p-6 shadow-candy">
      <p className="text-cola">We couldn&apos;t load the shops just now. The shop server may still be waking up.</p>
      <Button type="button" onClick={retry} className="rounded-full font-extrabold">
        Try again
      </Button>
    </div>
  );
}
