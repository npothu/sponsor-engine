"use client";

import { useState } from "react";
import type { Company } from "@/lib/schema";
import type { DiscordInboxMessage } from "@/lib/schema";
import {
  attachInboxMessageAction,
  dismissInboxMessageAction,
  triageInboxMessageAction,
} from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function formatWhen(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PendingMessage({
  message,
  companies,
}: {
  message: DiscordInboxMessage;
  companies: Company[];
}) {
  const [companyId, setCompanyId] = useState("");
  const [alsoLog, setAlsoLog] = useState(true);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {message.author ?? "Unknown author"}
          </span>
          {message.channelName && <Badge>#{message.channelName}</Badge>}
          <span className="text-xs text-muted-foreground">
            {formatWhen(message.postedAt)}
          </span>
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {message.content ? (
            message.content
          ) : (
            <span className="text-muted-foreground">(no text content)</span>
          )}
        </p>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <form className="flex flex-wrap items-center gap-2.5">
            <input type="hidden" name="inboxId" value={message.id} />
            <Select
              wrapperClassName="min-w-48 w-auto"
              name="companyId"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              aria-label="Attach to company"
            >
              <option value="">Attach to company...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="alsoLog"
                checked={alsoLog}
                onChange={(e) => setAlsoLog(e.target.checked)}
                className="accent-primary"
              />
              Log touchpoint
            </label>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!companyId}
              formAction={attachInboxMessageAction}
            >
              Attach
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!companyId}
              formAction={triageInboxMessageAction}
              title="Attach, ensure a current-cycle deal, nudge to conversation, and schedule a reply"
            >
              Triage into deal
            </Button>
          </form>

          <form action={dismissInboxMessageAction}>
            <input type="hidden" name="inboxId" value={message.id} />
            <Button type="submit" variant="secondary" size="sm">
              Dismiss
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
