import type { Metadata } from "next";
import { ConversationList } from "@/components/messages/conversation-list";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default function MessagesPage() {
  return (
    <>
      <h1 className="text-4xl font-extrabold text-cola">Messages</h1>
      <ConversationList
        basePath="/account/messages"
        title="Your inbox"
        description="Talk to Candy Lady support, and to the shop about an order you paid for."
      />
    </>
  );
}
