import Link from "next/link";
import type { ClosingBudgetWindow } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * "Budget windows closing soon" list on Today: companies whose fiscal-year-end
 * falls within the lookahead window. Budget usually has to be spent before the
 * fiscal boundary, so these are the companies to reach before their window
 * closes - an ask that lands after it is dead on arrival regardless of fit.
 */
export function BudgetWindowsCard({ rows }: { rows: ClosingBudgetWindow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed px-5 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          No budget windows closing soon. Set a fiscal-year-end on a company to
          have it appear here as its window approaches.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border px-0 py-0">
      {rows.map(({ company, fiscalYearEnd, daysUntil }) => (
        <div
          key={company.id}
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/companies/${company.id}`}
                className="font-semibold text-foreground hover:underline"
              >
                {company.name}
              </Link>
              <Badge variant="warning">
                {daysUntil === 0
                  ? "Closes today"
                  : `${daysUntil} day${daysUntil === 1 ? "" : "s"} left`}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fiscal year ends {fiscalYearEnd}
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/companies/${company.id}`}>Reach out</Link>
          </Button>
        </div>
      ))}
    </Card>
  );
}
