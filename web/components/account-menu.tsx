"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/api";
import { useRefreshSession, useSession } from "@/lib/use-session";

export function AccountMenu() {
  const { data, isPending } = useSession();
  const refresh = useRefreshSession();
  const router = useRouter();

  if (isPending) return <Skeleton className="h-9 w-24 rounded-full" />;

  const user = data?.user;
  if (!user) {
    return (
      <Link href="/login" className={buttonVariants({ variant: "outline", className: "h-9 rounded-full px-4" })}>
        Sign in
      </Link>
    );
  }

  async function signOut() {
    try {
      await auth.logout();
    } catch {
      toast.error("Could not sign out. Try again.");
      return;
    }
    await refresh();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="h-9 rounded-full px-3" />}>
        <UserRound aria-hidden />
        <span className="max-w-28 truncate">{user.name.split(" ")[0]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/account/orders" />}>Your orders</DropdownMenuItem>
          {(user.role === "seller" || user.role === "admin") && (
            <DropdownMenuItem render={<Link href="/seller" />}>Seller dashboard</DropdownMenuItem>
          )}
          {user.role === "admin" && <DropdownMenuItem render={<Link href="/admin" />}>Admin</DropdownMenuItem>}
          <DropdownMenuItem render={<Link href="/account" />}>Account</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
