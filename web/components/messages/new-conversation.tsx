"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, Panel } from "@/components/panel";
import { MessageBox } from "@/components/messages/conversation-thread";
import { useRefreshMessages } from "@/components/messages/use-unread";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import type { ConversationDetail, User } from "@/lib/types";

type Target =
  | { kind: "order"; orderId: number }
  | { kind: "seller"; sellerId?: number }
  | { kind: "support" };

/**
 * Start a conversation. Who it goes to comes from the link that opened it:
 * an order card (?order=), or nothing for support. Shops can also pick
 * another shop. Flask re-checks every one of these rules.
 */
export function NewConversation({ user, orderId, basePath }: { user: User; orderId?: number; basePath: string }) {
  const router = useRouter();
  const refresh = useRefreshMessages();
  const isShop = user.role === "seller" && !!user.seller_id;
  const [target, setTarget] = useState<Target>(orderId ? { kind: "order", orderId } : { kind: "support" });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { data: shops } = useQuery({
    queryKey: ["shops", "for-messaging"],
    queryFn: () => api.get<{ id: number; shop_name: string }[]>("/shops"),
    enabled: isShop && target.kind === "seller",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (target.kind === "seller" && !target.sellerId) {
      setProblem("Pick a shop to message.");
      return;
    }
    setBusy(true);
    try {
      const payload =
        target.kind === "order"
          ? { kind: "order", order_id: target.orderId, body }
          : target.kind === "seller"
            ? { kind: "seller", seller_id: target.sellerId, subject, body }
            : { kind: "support", subject, body };
      const conversation = await api.post<ConversationDetail>("/conversations", payload);
      await refresh();
      router.push(`${basePath}/${conversation.id}`);
    } catch (err) {
      setProblem(errorText(err, "That message did not send."));
      setBusy(false);
    }
  }

  const title =
    target.kind === "order"
      ? `Message the shop about order #${target.orderId}`
      : target.kind === "seller"
        ? "Message another shop"
        : "Message Candy Lady support";

  return (
    <Panel
      title={title}
      description={
        target.kind === "support"
          ? "Questions about an order, your account or your shop. We usually answer within a day."
          : target.kind === "order"
            ? isShop
              ? "The buyer gets this in their inbox."
              : "The shop gets this in their inbox. Keep payment and personal details off the chat."
            : "Only approved shops can message each other."
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {isShop && target.kind !== "order" && (
          <fieldset className="flex flex-wrap gap-4 text-sm font-bold text-cola">
            <legend className="sr-only">Who to message</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="to"
                checked={target.kind === "support"}
                onChange={() => setTarget({ kind: "support" })}
              />
              Support
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="to" checked={target.kind === "seller"} onChange={() => setTarget({ kind: "seller" })} />
              Another shop
            </label>
          </fieldset>
        )}

        {target.kind === "seller" && (
          <label className="flex flex-col gap-1 text-sm font-bold text-cola">
            Shop
            <select
              value={target.sellerId ?? ""}
              onChange={(e) => setTarget({ kind: "seller", sellerId: Number(e.target.value) || undefined })}
              className="h-10 rounded-lg border border-input bg-white px-2 font-normal"
            >
              <option value="">Choose a shop</option>
              {(shops ?? [])
                .filter((s) => s.id !== user.seller_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shop_name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {target.kind !== "order" && (
          <label className="flex flex-col gap-1 text-sm font-bold text-cola">
            Subject
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required className="h-10 bg-white" />
          </label>
        )}

        <MessageBox value={body} onChange={setBody} disabled={busy} />
        <FormMessage error>{problem}</FormMessage>
        <Button type="submit" disabled={busy || !body.trim()} className="self-start rounded-full font-extrabold">
          Send
        </Button>
      </form>
    </Panel>
  );
}
