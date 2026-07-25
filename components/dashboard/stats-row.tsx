import { Card } from "@/components/ui/card";
import { getDashboardStats } from "./stats";

function formatDollars(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export async function StatsRow() {
  const stats = await getDashboardStats();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="gap-1.5 px-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Active deals
        </span>
        <span className="font-display text-2xl font-bold text-foreground">
          {stats.activeDealsCount}
        </span>
        <span className="text-sm text-muted-foreground">
          {stats.cycle ? `in ${stats.cycle}` : "no cycle data yet"}
        </span>
      </Card>

      <Card className="gap-1.5 px-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Committed this cycle
        </span>
        <span className="font-display text-2xl font-bold text-foreground">
          {formatDollars(stats.committedDollars)}
        </span>
        <span className="text-sm text-muted-foreground">
          committed, fulfilling &amp; renewed deals
        </span>
      </Card>

      <Card className="gap-1.5 px-5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Anchor progress
        </span>
        <span className="font-display text-2xl font-bold text-foreground">
          {stats.anchorSponsorCount} of {stats.anchorTarget}
        </span>
        <span className="text-sm text-muted-foreground">
          {stats.anchorTierName
            ? `${stats.anchorTierName}-level sponsors`
            : "anchor-tier sponsors"}
        </span>
      </Card>
    </div>
  );
}

export default StatsRow;
