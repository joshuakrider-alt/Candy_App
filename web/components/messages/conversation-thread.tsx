"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormMessage, Panel } from "@/components/panel";
import { useRefreshMessages, when } from "@/components/messages/use-unread";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import type { ChatMessage, ConversationDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Kept in step with MESSAGE_MAX_LENGTH in backend/messaging.py (Flask enforces it). */
export const MAX_MESSAGE_LENGTH = 2000;

export function MessageBox({
  value,
  onChange,
  label = "Message",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-sm font-bold text-cola">
        {label}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={4}
          disabled={disabled}
          className="w-full rounded-lg border border-input bg-white px-3 py-2 text-base font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
        />
      </label>
      <span className="self-end text-xs text-muted-foreground">
        {value.length}/{MAX_MESSAGE_LENGTH}
      </span>
    </div>
  );
}

function ReportButton({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function report() {
    setBusy(true);
    try {
      await api.post(`/messages/${message.id}/report`, { reason: reason.trim() || undefined });
      setDone(true);
      setOpen(false);
      toast.success("Thanks. An admin will look at it.");
    } catch (e) {
      toast.error(errorText(e, "That report did not send."));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="text-xs text-muted-foreground">Reported</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline">
        Report
      </button>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Input
        aria-label="What's wrong with this message? (optional)"
        placeholder="What's wrong? (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        className="h-8 max-w-64 bg-white"
      />
      <Button size="sm" variant="outline" onClick={report} disabled={busy} className="rounded-full">
        Send report
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs underline">
        Cancel
      </button>
    </div>
  );
}

/** One conversation: its messages, a reply box, and block and report controls. */
export function ConversationThread({ id, backHref }: { id: number; backHref: string }) {
  const client = useQueryClient();
  const refreshMessages = useRefreshMessages();
  const key = ["messages", "thread", id];
  const { data, error, isPending } = useQuery({
    queryKey: key,
    queryFn: () => api.get<ConversationDetail>(`/conversations/${id}`),
    refetchInterval: 15_000,
  });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);

  const unread = data?.unread_count ?? 0;
  const latest = data?.messages.at(-1)?.id;
  useEffect(() => {
    if (!unread) return;
    // Opening the thread reads it; the badge in the header follows.
    api
      .post(`/conversations/${id}/read`)
      .then(() => client.invalidateQueries({ queryKey: ["messages", "unread"] }))
      .catch(() => {});
  }, [id, unread, latest, client]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [latest]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`/conversations/${id}/messages`, { body });
      setBody("");
      await refreshMessages();
    } catch (err) {
      setProblem(errorText(err, "That message did not send."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!data) return;
    setBusy(true);
    try {
      const next = data.blocked.by_me
        ? await api.delete<ConversationDetail>(`/conversations/${id}/block`)
        : await api.post<ConversationDetail>(`/conversations/${id}/block`);
      client.setQueryData(key, next);
      toast.success(next.blocked.by_me ? `Blocked ${data.with.name}.` : `Unblocked ${data.with.name}.`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (error) {
    return (
      <Panel title="Messages">
        <p role="alert" className="font-bold text-destructive">
          {errorText(error, "Could not load this conversation.")}
        </p>
        <Link href={backHref} className="mt-3 inline-block font-bold text-cherry-deep underline">
          Back to messages
        </Link>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={backHref} className="text-sm font-bold text-cherry-deep underline">
            All messages
          </Link>
          <h2 className="font-heading text-2xl font-bold text-cola">{data.subject}</h2>
          <p className="text-sm text-muted-foreground">
            With {data.with.name}
            {data.order_id && data.with.type === "seller" && (
              <>
                {" · "}
                <Link href="/account/orders" className="underline">
                  your orders
                </Link>
              </>
            )}
          </p>
        </div>
        {data.can_block && (
          <Button size="sm" variant="outline" onClick={toggleBlock} disabled={busy} className="rounded-full">
            {data.blocked.by_me ? "Unblock" : "Block"}
          </Button>
        )}
      </div>

      <ol aria-label="Messages" className="mt-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {data.messages.map((m) => (
          <li key={m.id} className={cn("flex flex-col", m.from_me ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2 whitespace-pre-wrap break-words",
                m.from_me ? "bg-cherry-deep text-white" : "bg-white text-cola ring-1 ring-border",
              )}
            >
              {m.body}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {m.from_me ? "You" : m.sender_name} · {when(m.created_at)}
            </p>
            {!m.from_me && <ReportButton message={m} />}
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ol>

      {data.reply_problem ? (
        <p role="status" className="mt-4 rounded-md bg-muted p-3 text-sm font-bold text-cola">
          {data.reply_problem.charAt(0).toUpperCase() + data.reply_problem.slice(1)}.
        </p>
      ) : (
        <form onSubmit={send} className="mt-4 flex flex-col gap-2">
          <MessageBox label="Reply" value={body} onChange={setBody} disabled={busy} />
          <FormMessage error>{problem}</FormMessage>
          <Button type="submit" disabled={busy || !body.trim()} className="self-start rounded-full font-extrabold">
            Send
          </Button>
        </form>
      )}
    </Panel>
  );
}
