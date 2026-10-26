import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConversationThread } from "@/components/messages/conversation-thread";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <ConversationThread id={id} backHref="/account/messages" />;
}
