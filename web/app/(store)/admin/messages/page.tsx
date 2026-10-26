import type { Metadata } from "next";
import { MessageReports } from "@/components/admin/message-reports";
import { ConversationList } from "@/components/messages/conversation-list";

export const metadata: Metadata = { title: "Support inbox" };

export default function AdminMessagesPage() {
  return (
    <>
      <ConversationList
        basePath="/admin/messages"
        title="Support inbox"
        description="Every buyer and shop that wrote to support. Any admin can answer; replies show as Candy Lady support."
        showNew={false}
      />
      <MessageReports />
    </>
  );
}
