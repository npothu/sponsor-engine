import Link from "next/link";
import type { RevenueSummary } from "@/lib/data";
import type { Tier } from "@/lib/schema";
import { channelLabel, formatDate, formatDollars, stageLabel, type OpenThread } from "./lib";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/page-header";

interface OrgSummaryProps {
  cycle: string;
  tiers: Tier[];
  revenue: RevenueSummary;
  threads: OpenThread[];
  companyCount: number;
}

/**
 * Org-level briefing: role context, the current cycle, the active tier
 * structure, revenue totals, and the top open threads a successor should
 * pick up first.
 */
export function OrgSummary({ cycle, tiers, revenue, threads, companyCount }: OrgSummaryProps) {
  return (
    <div className="space-y-4">
      <Card className="px-5">
        <SectionHeading>Role and cycle</SectionHeading>
        <p className="text-sm leading-relaxed text-foreground">
          The pipeline owner runs sponsorship end to end: prospecting companies,
          running the deal pipeline through commitment, and fulfilling what was
          promised.
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          Current cycle is <strong className="font-semibold">{cycle}</strong>, tracking
          toward the anchor event.
          The anchor goal is 2 to 3 Gold-level sponsors.
        </p>

        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Companies tracked" value={String(companyCount)} />
          <Stat label="Committed this cycle" value={formatDollars(revenue.committedTotal)} />
          <Stat label="Weighted pipeline" value={formatDollars(revenue.weightedPipeline)} />
          <Stat
            label="Anchor sponsors"
            value={`${revenue.anchorCount} / ${revenue.anchorTarget || "-"}`}
          />
        </div>
      </Card>

      <Card className="px-5">
        <SectionHeading>Tier structure</SectionHeading>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active tiers configured.</p>
        ) : (
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div
                key={t.id}
                className={
                  i < tiers.length - 1
                    ? "flex items-baseline justify-between gap-3 border-b pb-2 text-sm"
                    : "flex items-baseline justify-between gap-3 text-sm"
                }
              >
                <span>
                  <strong className="font-semibold text-foreground">{t.name}</strong>
                  {t.description ? (
                    <span className="text-muted-foreground"> - {t.description}</span>
                  ) : null}
                </span>
                <Badge variant="default" className="shrink-0">{formatDollars(t.price)}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="px-5">
        <SectionHeading>Top open threads</SectionHeading>
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active deals in the current cycle.</p>
        ) : (
          <div className="space-y-2.5">
            {threads.map((t) => (
              <div
                key={t.dealId}
                className="grid grid-cols-[1fr_auto] gap-2 border-b pb-2.5 text-sm last:border-b-0 last:pb-0"
              >
                <div>
                  <Link href={`/companies/${t.companyId}`} className="font-medium text-primary hover:underline dark:text-lime">
                    {t.companyName}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.latestTouchpoint
                      ? `Last touch: ${channelLabel(t.latestTouchpoint.channel)} on ${formatDate(t.latestTouchpoint.occurredAt)}`
                      : "No touchpoints logged yet"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.nextAction
                      ? `Next: ${t.nextAction.title} (due ${formatDate(t.nextAction.dueDate)})`
                      : "No open next action"}
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary">{stageLabel(t.stage)}</Badge>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDollars(t.askAmount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-xl font-bold text-foreground">{value}</div>
    </Card>
  );
}
