"use client";

import { Button } from "@/components/ui/button";

// Shown when a page could not load its data: almost always the free-tier API
// waking up, which takes up to a minute.
export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl bg-paper/95 p-8 text-center shadow-candy">
      <h1 className="text-3xl font-extrabold text-cola">Waking up the shop, one moment.</h1>
      <p className="text-muted-foreground">The shop&apos;s server was asleep. Try again in a few seconds.</p>
      <Button onClick={reset} className="h-11 rounded-full px-6 font-extrabold">
        Try again
      </Button>
    </section>
  );
}
