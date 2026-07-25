import Link from "next/link";
import { stalledDeals, normalizeCompanyPriority } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/app/companies/ui";
import {
  ReEngageButton,
  ReEngageAllHighPriority,
} from "./re-engage-buttons";

export async function StalledDealsList() {
  const deals = await stalledDeals();

  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        No stalled deals. Everything active has recent movement.
      </div>
    );
  }

  const highPriorityCount = deals.filter(
    (d) => normalizeCompanyPriority(d.company.priority) === "high",
  ).length;

  return (
    <div className="flex flex-col gap-2">
      <ReEngageAllHighPriority count={highPriorityCount} />
      {deals.map((deal) => (
        <div
          key={deal.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(28,55,32,0.04)]"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Link
                href={`/companies/${deal.company.id}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-lime"
              >
                {deal.company.name}
              </Link>
              <PriorityBadge priority={deal.company.priority} />
            </div>
            <span className="text-sm text-muted-foreground">
              {deal.stage} &middot; {deal.cycle} &middot; SLA {deal.slaDays}d
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge
              variant={deal.severity === "critical" ? "destructive" : "warning"}
              title={`${deal.daysStale} days since last activity, ${deal.daysOverSla}d past the ${deal.stage} SLA of ${deal.slaDays}d`}
            >
              {deal.daysStale}d stale &middot; +{deal.daysOverSla}d
            </Badge>
            <ReEngageButton dealId={deal.id} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default StalledDealsList;
