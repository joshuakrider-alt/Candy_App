"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CartContents } from "@/components/cart/cart-contents";
import { useCartDrawer } from "@/store/cart";

/** The slide-out cart, opened by Add and by the header's cart button. */
export function CartDrawer() {
  const { open, setOpen } = useCartDrawer();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-heading text-2xl font-extrabold text-cola">Your cart</SheetTitle>
          <SheetDescription className="sr-only">Items you are about to order for pickup.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <CartContents onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
