"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { CartBootstrap } from "@/components/cart/cart-bootstrap";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Signed-in screens refetch when the tab regains focus; a 401 is
          // final (the proxy already dropped the cookie), so it is not retried.
          queries: {
            staleTime: 15_000,
            retry: (count, error) => count < 2 && (error as { status?: number }).status !== 401,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <CartBootstrap />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
