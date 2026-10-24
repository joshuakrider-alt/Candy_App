"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { badgeText, useUnreadCount } from "@/components/messages/use-unread";
import { useSession } from "@/lib/use-session";

/** Header inbox icon with the unread count. Only shown to a signed-in visitor. */
export function MessagesButton() {
  const { data } = useSession();
  const unread = useUnreadCount();
  if (!data?.user) return null;
  const href = data.user.role === "admin" ? "/admin/messages" : "/account/messages";
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      className="relative inline-flex size-9 items-center justify-center rounded-full border border-border bg-white/80 text-cola hover:bg-accent"
    >
      <MessageCircle aria-hidden className="size-4" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cherry-deep px-1 text-xs font-extrabold text-white">
          {badgeText(unread)}
        </span>
      )}
    </Link>
  );
}
