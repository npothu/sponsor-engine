import Link from "next/link";
import type { ResurfacingProspect } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * "Resurfacing" list on Today: companies whose dated re-ask promise has now come
 * due. These are warm, timing-deferred leads ("ask us in Q3") that the cold pool
 * deliberately suppresses, so this is the only place they reappear - on the exact
 * week they were promised, surviving any exec-board turnover in between.
 */
export function ResurfacingCard({ rows }: { rows: ResurfacingProspect[] }) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed px-5 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing to resurface. Set an &ldquo;ask again on&rdquo; date on a
          company to have it reappear here when the time comes.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border px-0 py-0">
      {rows.map(({ company, reAskOn, reAskReason }) => (
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
              <Badge variant="warning">Due {reAskOn}</Badge>
            </div>
            {reAskReason && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {reAskReason}
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/companies/${company.id}`}>Re-approach</Link>
          </Button>
        </div>
      ))}
    </Card>
  );
}
