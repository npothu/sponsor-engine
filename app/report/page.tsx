import { getReportData, type PipelineStageRow } from "./queries";
import { formatMoney, formatDate, formatDateTime, pct } from "./format";
import { DownloadReportButton } from "./download-button";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SatisfactionBadge } from "@/app/companies/ui";
import type { FulfillmentHealthRow, LossReasonBucket } from "@/lib/data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * /report - the exec-board read-only status view. Presentation-grade summary:
 * revenue vs goal, anchor progress, pipeline by stage (company names only, no
 * contact info), recent wins, upcoming deliverables, and stalled/risk deals.
 * No edit controls anywhere on this page - it exists purely to be read,
 * printed, or exported as a static HTML snapshot for the board.
 */
export default async function ReportPage() {
  const data = await getReportData();
  const {
    cycle,
    generatedAt,
    revenue,
    anchorTier,
    pipeline,
    recentWins,
    upcomingDeliverables,
    risks,
    fulfillmentHealth,
    lossReasons,
  } = data;

  const committedPct = pct(revenue.committedTotal, revenue.goal);
  const anchorPct = pct(revenue.anchorCount, revenue.anchorTarget);
  const pipelineRows = pipeline.filter((row) => row.companies.length > 0);

  return (
    <div className="space-y-7 print:text-black">
      <PageHeader
        className="print:mb-4"
        title="Sponsorship - Status Report"
        subtitle={
          <>
            Cycle {cycle} &middot; board-safe snapshot of pipeline, revenue,
            and fulfillment.
            <span className="mt-1 block text-xs text-muted-foreground">
              Generated {formatDateTime(generatedAt)}
            </span>
          </>
        }
        actions={
          <div className="print:hidden">
            <DownloadReportButton cycle={cycle} />
          </div>
        }
      />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5 print:grid-cols-3">
        <Card className="px-5 print:border print:shadow-none">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Committed revenue
          </div>
          <div className="font-display text-2xl font-bold text-primary dark:text-foreground">
            {formatMoney(revenue.committedTotal)}
          </div>
          <div className="text-sm text-muted-foreground">
            of {formatMoney(revenue.goal)} goal ({committedPct}%)
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full border bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${committedPct}%` }}
            />
          </div>
        </Card>

        <Card className="px-5 print:border print:shadow-none">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Weighted pipeline
          </div>
          <div className="font-display text-2xl font-bold text-primary dark:text-foreground">
            {formatMoney(revenue.weightedPipeline)}
          </div>
          <div className="text-sm text-muted-foreground">
            probability-adjusted, active deals
          </div>
        </Card>

        <Card className="px-5 print:border print:shadow-none">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Anchor progress{anchorTier ? ` (${anchorTier.name})` : ""}
          </div>
          <div className="font-display text-2xl font-bold text-primary dark:text-foreground">
            {revenue.anchorCount} of {revenue.anchorTarget}
          </div>
          <div className="text-sm text-muted-foreground">{anchorPct}% of anchor goal</div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full border bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${anchorPct}%` }}
            />
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading>Pipeline by stage</SectionHeading>
        <PipelineTable rows={pipelineRows} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Recent wins (last 60 days)</SectionHeading>
        <Card className="overflow-hidden py-0 print:border print:shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Ask</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentWins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm italic text-muted-foreground">
                    No deals reached committed status in the last 60 days.
                  </TableCell>
                </TableRow>
              ) : (
                recentWins.map((w) => (
                  <TableRow key={w.dealId}>
                    <TableCell className="font-medium text-foreground">{w.companyName}</TableCell>
                    <TableCell>
                      <Badge variant="default">{w.stageLabel}</Badge>
                    </TableCell>
                    <TableCell>{w.tierName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-right">{formatMoney(w.askAmount)}</TableCell>
                    <TableCell>{formatDate(w.stageEnteredAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading>Upcoming deliverables (next 30 days)</SectionHeading>
        <Card className="overflow-hidden py-0 print:border print:shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Deliverable</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcomingDeliverables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm italic text-muted-foreground">
                    No deliverables due in the next 30 days.
                  </TableCell>
                </TableRow>
              ) : (
                upcomingDeliverables.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium text-foreground">{d.companyName}</TableCell>
                    <TableCell>{d.title}</TableCell>
                    <TableCell>{d.owner ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell>{formatDate(d.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading>Fulfillment health</SectionHeading>
        <FulfillmentHealthTable rows={fulfillmentHealth} />
      </section>

      <section className="space-y-3">
        <SectionHeading>Stalled / at risk</SectionHeading>
        <Card className="overflow-hidden py-0 print:border print:shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Stale</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm italic text-muted-foreground">
                    No stalled deals right now.
                  </TableCell>
                </TableRow>
              ) : (
                risks.map((r) => (
                  <TableRow key={r.dealId}>
                    <TableCell className="font-medium text-foreground">{r.companyName}</TableCell>
                    <TableCell>{r.stageLabel}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">
                      {r.daysStale}d
                    </TableCell>
                    <TableCell>{formatDate(r.lastActivityAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading>Why deals lapsed</SectionHeading>
        <LossReasonTable rows={lossReasons} />
      </section>
    </div>
  );
}

function LossReasonTable({ rows }: { rows: LossReasonBucket[] }) {
  const totalLost = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Card className="overflow-hidden py-0 print:border print:shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Deals</TableHead>
            <TableHead className="text-right">Share</TableHead>
            <TableHead className="text-right">Dollars lost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-6 text-center text-sm italic text-muted-foreground"
              >
                No deals have lapsed in this cycle.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.reason ?? "none"}>
                <TableCell className="font-medium text-foreground">
                  {r.label}
                </TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {totalLost > 0 ? `${Math.round((r.count / totalLost) * 100)}%` : "-"}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoney(r.lostDollars)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function FulfillmentHealthTable({ rows }: { rows: FulfillmentHealthRow[] }) {
  return (
    <Card className="overflow-hidden py-0 print:border print:shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sponsor</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead className="text-right">Delivered</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            <TableHead className="text-right">Proof</TableHead>
            <TableHead>Satisfaction</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-6 text-center text-sm italic text-muted-foreground"
              >
                No committed sponsors in fulfillment yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.dealId}>
                <TableCell className="font-medium text-foreground">
                  {r.companyName}
                </TableCell>
                <TableCell>
                  {r.tierName ?? <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-right">
                  {r.done} / {r.total}
                </TableCell>
                <TableCell
                  className={
                    r.overdue > 0
                      ? "text-right font-semibold text-destructive"
                      : "text-right text-muted-foreground"
                  }
                >
                  {r.overdue}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {r.proofCaptured} / {r.done}
                </TableCell>
                <TableCell>
                  {r.satisfaction ? (
                    <SatisfactionBadge satisfaction={r.satisfaction} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function PipelineTable({ rows }: { rows: PipelineStageRow[] }) {
  return (
    <Card className="overflow-hidden py-0 print:border print:shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead>Companies</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead className="text-right">Dollars</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-sm italic text-muted-foreground">
                No deals in this cycle yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.stage}>
                <TableCell className="whitespace-nowrap font-semibold text-foreground">
                  {row.label}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.companies.map((c) => c.name).join(", ")}
                </TableCell>
                <TableCell className="text-right">{row.companies.length}</TableCell>
                <TableCell className="text-right">{formatMoney(row.dollars)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
