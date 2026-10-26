import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewConversation } from "@/components/messages/new-conversation";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "New message", robots: { index: false } };

type Props = { searchParams: Promise<{ order?: string }> };

export default async function NewMessagePage({ searchParams }: Props) {
  const me = await getSession();
  if (!me) redirect("/login?next=/account/messages/new");
  const order = Number((await searchParams).order);
  return (
    <NewConversation
      user={me.user}
      orderId={Number.isInteger(order) && order > 0 ? order : undefined}
      basePath="/account/messages"
    />
  );
}
