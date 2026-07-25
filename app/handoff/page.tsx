import Link from "next/link";
import {
  getCurrentCycle,
  listReAskCommitments,
  listTiers,
  revenueSummary,
} from "@/lib/data";
import {
  buildRelationshipState,
  formatDate,
  listCompaniesWithDeals,
  listTopOpenThreads,
} from "./lib";
import { ExportButton } from "./export-button";
import { OrgSummary } from "./org-summary";
import { CompanyCard } from "./company-card";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * /handoff - EVP succession mode. A read-only briefing a new External VP can
 * use to pick up the pipeline cold: org context, tier structure, revenue
 * totals, top open threads, and a state-of-the-relationship card for every
 * company that has ever had a deal. The only interactive control is the
 * Markdown export.
 */
export default async function HandoffPage() {
  const cycle = await getCurrentCycle();
  const tiers = await listTiers(true);
  const revenue = await revenueSummary(cycle);
  const threads = await listTopOpenThreads(cycle);
  const companies = await listCompaniesWithDeals();
  const relationships = await Promise.all(companies.map((c) => buildRelationshipState(c)));
  const reAsks = await listReAskCommitments();

  return (
    <div>
      <PageHeader
        title="Handoff"
        subtitle="Everything the next External VP needs to pick up the pipeline."
        actions={<ExportButton cycle={cycle} />}
      />

      <OrgSummary
        cycle={cycle}
        tiers={tiers}
        revenue={revenue}
        threads={threads}
        companyCount={companies.length}
      />

      <div className="mt-8 space-y-3.5">
        <div className="flex items-baseline justify-between">
          <SectionHeading>Promised re-asks</SectionHeading>
          <span className="text-sm text-muted-foreground">
            {reAsks.length} {reAsks.length === 1 ? "promise" : "promises"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Companies that asked us to come back on a specific date, whether or not
          they ever had a deal. These promises survive board turnover - honor them
          the week they come due.
        </p>
        {reAsks.length === 0 ? (
          <Card className="border-dashed items-center px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No promised re-asks on record. Set an &ldquo;ask again on&rdquo; date
              on a company when it defers you to a future window.
            </p>
          </Card>
        ) : (
          <div className="grid gap-2">
            {reAsks.map((r) => (
              <div
                key={r.company.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(28,55,32,0.04)]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/companies/${r.company.id}`}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-lime"
                    >
                      {r.company.name}
                    </Link>
                    <Badge variant="warning">
                      Ask again {formatDate(r.reAskOn)}
                    </Badge>
                  </div>
                  {(r.reAskReason || r.contact) && (
                    <span className="text-sm text-muted-foreground">
                      {r.reAskReason ?? ""}
                      {r.reAskReason && r.contact ? " " : ""}
                      {r.contact ? `(per ${r.contact.name})` : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-3.5">
        <div className="flex items-baseline justify-between">
          <SectionHeading>State of the relationship</SectionHeading>
          <span className="text-sm text-muted-foreground">
            {relationships.length} {relationships.length === 1 ? "company" : "companies"}
          </span>
        </div>

        {relationships.length === 0 ? (
          <Card className="border-dashed items-center px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No companies have a deal yet. Once a company has at least one deal,
              its relationship card will appear here.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {relationships.map((r) => (
              <CompanyCard key={r.detail.company.id} state={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
