"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { when } from "@/components/messages/use-unread";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import type { MessageReport } from "@/lib/types";

const KEY = ["admin-message-reports", "open"];

/** Messages people reported (GET /admin/message-reports), with a few before each for context. */
export function MessageReports() {
  const client = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<MessageReport[]>("/admin/message-reports?status=open"),
  });
  const [busy, setBusy] = useState<number | null>(null);

  async function resolve(report: MessageReport) {
    setBusy(report.id);
    try {
      await api.put(`/admin/message-reports/${report.id}`, { status: "resolved" });
      toast.success("Report closed.");
      await client.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      title="Reported messages"
      description="Someone flagged these. The person who reported it can also block the sender from their side."
    >
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p role="alert" className="font-bold text-destructive">
          {errorText(error, "Could not load reports.")}
        </p>
      ) : !data.length ? (
        <p className="text-muted-foreground">Nothing reported.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((report) => (
            <li
              key={report.id}
              aria-label={`Report about ${report.message.sender_name}`}
              className="flex flex-col gap-2 rounded-md border border-border bg-white p-3"
            >
              <p className="text-sm text-cola">
                <strong>{report.reporter_name}</strong> reported <strong>{report.message.sender_name}</strong> in “
                {report.conversation.subject}” · {when(report.created_at)}
              </p>
              {report.reason && <p className="text-sm text-cola">Reason: {report.reason}</p>}
              <ol className="flex flex-col gap-1 rounded-md bg-muted p-2 text-sm">
                {report.context.map((m) => (
                  <li key={m.id} className={m.id === report.message.id ? "font-bold text-destructive" : "text-cola"}>
                    <span className="text-muted-foreground">{m.sender_name}:</span>{" "}
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                  </li>
                ))}
              </ol>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolve(report)}
                disabled={busy === report.id}
                className="self-start rounded-full"
              >
                Mark handled
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
