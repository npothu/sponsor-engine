"use client";

import { formatDistanceToNow } from "date-fns";
import { LogForm } from "./log-form";
import type {
  CompanyOption,
  ContactOption,
  DealOption,
  RecentTouchpointRow,
  TemplateOption,
} from "./queries";
import type { DeckVersion } from "@/lib/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/page-header";

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  career_fair: "Career fair",
  linkedin: "LinkedIn",
  discord: "Discord",
  other: "Other",
};

/**
 * Some timestamps in this app (e.g. touchpoints.createdAt, which relies on
 * SQLite's bare CURRENT_TIMESTAMP default) are stored as naive
 * "YYYY-MM-DD HH:mm:ss" UTC strings with no timezone marker. `new Date()`
 * parses a string like that as local time, silently shifting it by the
 * local UTC offset. Append "Z" when a string looks naive so it's always
 * parsed as UTC.
 */
function parseDbTimestamp(value: string): Date {
  const looksNaive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value);
  return new Date(looksNaive ? `${value.replace(" ", "T")}Z` : value);
}

function formatOccurredAt(iso: string): string {
  try {
    return parseDbTimestamp(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export interface BackfillClientProps {
  companies: CompanyOption[];
  contacts: ContactOption[];
  deals: DealOption[];
  deckVersions: DeckVersion[];
  templates: TemplateOption[];
  initialRecent: RecentTouchpointRow[];
}

export function BackfillClient({
  companies,
  contacts,
  deals,
  deckVersions,
  templates,
  initialRecent,
}: BackfillClientProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 items-start lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Log a touch</CardTitle>
        </CardHeader>
        <CardContent>
          <LogForm
            companies={companies}
            contacts={contacts}
            deals={deals}
            deckVersions={deckVersions}
            templates={templates}
            variant="inline"
          />
        </CardContent>
      </Card>

      <div>
        <SectionHeading className="mb-3">Recently logged</SectionHeading>
        {initialRecent.length === 0 ? (
          <Card className="border-dashed">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Nothing logged yet. Entries you add here will show up in this
                list so you can confirm the import is going well.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {initialRecent.map((t) => (
              <Card key={t.id} className="py-3">
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {t.companyName}
                    </span>
                    <Badge variant="secondary">
                      {CHANNEL_LABELS[t.channel] ?? t.channel}
                    </Badge>
                    <Badge variant={t.direction === "inbound" ? "lime" : "outline"}>
                      {t.direction === "inbound" ? "Inbound" : "Outbound"}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatOccurredAt(t.occurredAt)}
                    </span>
                  </div>
                  {(t.summary || t.contactName || t.outcome || t.deckVersionLabel) && (
                    <div className="text-sm text-muted-foreground">
                      {t.contactName && <span>with {t.contactName}</span>}
                      {t.summary && (
                        <span>
                          {t.contactName ? " - " : ""}
                          {t.summary}
                        </span>
                      )}
                      {t.outcome && <span> - {t.outcome}</span>}
                      {t.deckVersionLabel && <span> - deck: {t.deckVersionLabel}</span>}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground/80">
                    logged{" "}
                    {formatDistanceToNow(parseDbTimestamp(t.createdAt), {
                      addSuffix: true,
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BackfillClient;
