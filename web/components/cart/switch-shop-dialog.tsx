"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart, useCartDrawer } from "@/store/cart";
import { usePendingSwitch } from "@/components/cart/use-add-to-cart";

/** "Your cart has items from Ms. Kiki's. Start a new cart?" */
export function SwitchShopDialog() {
  const { pending, setPending } = usePendingSwitch();
  const currentShop = useCart((s) => s.shopName);
  const startOver = useCart((s) => s.startOver);
  const add = useCart((s) => s.add);
  const openDrawer = useCartDrawer((s) => s.setOpen);

  function confirm() {
    if (!pending) return;
    startOver(pending.shop);
    add(pending.shop, pending.line);
    setPending(null);
    openDrawer(true);
  }

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl text-cola">Start a new cart?</DialogTitle>
          <DialogDescription>
            Your cart has items from {currentShop ?? "another shop"}. Each order is picked up from one shop, so adding
            from {pending?.shop.name} empties it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setPending(null)}>
            Keep my cart
          </Button>
          <Button className="rounded-full font-extrabold" onClick={confirm}>
            Start a new cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
