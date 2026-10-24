"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { badgeText, when } from "@/components/messages/use-unread";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import type { ConversationKind, ConversationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ConversationKind, string> = {
  support: "Support",
  seller: "Shop to shop",
  order: "Order",
};

/** Every conversation the visitor is part of, newest first (GET /conversations). */
export function ConversationList({
  basePath,
  title = "Messages",
  description,
  showNew = true,
}: {
  basePath: string;
  title?: string;
  description?: string;
  showNew?: boolean;
}) {
  const { data, error, isPending } = useQuery({
    queryKey: ["messages", "list"],
    queryFn: () => api.get<ConversationSummary[]>("/conversations"),
    refetchInterval: 30_000,
  });

  return (
    <Panel title={title} description={description}>
      {showNew && (
        <Link
          href={`${basePath}/new`}
          prefetch={false}
          className={buttonVariants({ className: "mb-4 rounded-full font-extrabold" })}
        >
          New message
        </Link>
      )}
      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <p role="alert" className="font-bold text-destructive">
          {errorText(error, "Could not load your messages.")}
        </p>
      ) : !data.length ? (
        <p className="text-muted-foreground">No messages yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-white">
          {data.map((c) => (
            <li key={c.id}>
              <Link
                href={`${basePath}/${c.id}`}
                prefetch={false}
                aria-label={`${c.subject} with ${c.with.name}${c.unread_count ? `, ${c.unread_count} unread` : ""}`}
                className="flex items-start gap-3 p-3 hover:bg-accent/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-cola", c.unread_count ? "font-extrabold" : "font-bold")}>
                      {c.with.name}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">{when(c.last_message_at)}</span>
                  </div>
                  <p className="truncate text-sm text-cola">
                    <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                      {KIND_LABEL[c.kind]}
                    </span>
                    {c.subject}
                  </p>
                  {c.last_message && (
                    <p className="truncate text-sm text-muted-foreground">
                      {c.last_message.from_me ? "You: " : ""}
                      {c.last_message.preview}
                    </p>
                  )}
                </div>
                {c.unread_count > 0 && (
                  <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cherry-deep px-1 text-xs font-extrabold text-white">
                    {badgeText(c.unread_count)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
