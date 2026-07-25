import {
  companiesWithClosingBudgetWindow,
  dealsMissingNextAction,
  getActiveCycleAnchor,
  getCurrentCycle,
  getWeeklyLaunchQuota,
  listLaunchCohort,
  listResurfacingProspects,
  outreachCapacityStatus,
  topProspectsToStart,
} from "@/lib/data";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { StatsRow } from "@/components/dashboard/stats-row";
import { Scoreboard } from "@/components/dashboard/scoreboard";
import { ActionGroups } from "@/components/dashboard/action-groups";
import { NagList } from "@/components/dashboard/nag-list";
import { StalledDealsList } from "@/components/dashboard/stalled-deals-list";
import { AnchorCountdown } from "@/components/dashboard/anchor-countdown";
import { ResurfacingCard } from "@/components/dashboard/resurfacing-card";
import { BudgetWindowsCard } from "@/components/dashboard/budget-windows-card";
import {
  TopProspectsCard,
  type TopProspectRow,
} from "@/components/dashboard/top-prospects-card";
import { Badge } from "@/components/ui/badge";

export default async function TodayPage() {
  const missingNextAction = await dealsMissingNextAction();
  const anchor = await getActiveCycleAnchor();
  const resurfacing = await listResurfacingProspects();
  const budgetWindows = await companiesWithClosingBudgetWindow();
  const topProspects: TopProspectRow[] = (await topProspectsToStart(5)).map((p) => ({
    companyId: p.company.id,
    companyName: p.company.name,
    priority: p.priority,
    fitScore: p.fitScore,
    compositeRank: p.compositeRank,
    dealId: p.newestDeal!.id,
  }));
  const capacity = await outreachCapacityStatus(await getCurrentCycle());
  const launchQuota = await getWeeklyLaunchQuota();
  const launchCohort: TopProspectRow[] = (await listLaunchCohort(launchQuota)).map(
    (p) => ({
      companyId: p.company.id,
      companyName: p.company.name,
      priority: p.priority,
      fitScore: p.fitScore,
      compositeRank: p.compositeRank,
      dealId: p.newestDeal!.id,
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Today"
        subtitle="Your due next actions, stalled deals, and what needs attention right now."
      />

      <StatsRow />

      <Scoreboard />

      <AnchorCountdown anchor={anchor} />

      {capacity.overCapacity && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/8 px-5 py-4 dark:bg-destructive/12">
          <p className="font-display text-base font-semibold text-destructive">
            You can&apos;t email your way out of this
          </p>
          <p className="mt-1 text-sm text-foreground">
            {capacity.winnableBacklog} winnable companies are waiting, but with{" "}
            {capacity.weeksRemaining} week
            {capacity.weeksRemaining === 1 ? "" : "s"} left at{" "}
            {capacity.weeklyQuota}/week you can only work about {capacity.capacity}{" "}
            before the anchor event.{" "}
            {capacity.winnableBacklog - (capacity.capacity ?? 0)} won&apos;t get
            worked in time - prioritize the highest-value prospects or bring on
            more help.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <ActionGroups />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SectionHeading>Needs a next action</SectionHeading>
          <Badge>{missingNextAction.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Active deals with no open next action - every active deal should have one.
        </p>
        <NagList deals={missingNextAction} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SectionHeading>This week&apos;s launch cohort</SectionHeading>
          <Badge>
            {launchCohort.length} of {launchQuota}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          The top-ranked startable prospects to launch this week, capped at the
          weekly quota of {launchQuota} so you only start what you can actually
          follow up on. Start outreach without leaving Today.
        </p>
        <TopProspectsCard rows={launchCohort} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Top prospects to start</SectionHeading>
        <p className="text-sm text-muted-foreground">
          The highest expected-value prospects still waiting to be started,
          ranked by priority and fit. Start outreach without leaving Today.
        </p>
        <TopProspectsCard rows={topProspects} />
      </section>

      {resurfacing.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SectionHeading>Resurfacing</SectionHeading>
            <Badge variant="warning">{resurfacing.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Companies that asked you to come back - their re-approach date has
            arrived. These are warm, timing-deferred leads, not cold prospects.
          </p>
          <ResurfacingCard rows={resurfacing} />
        </section>
      )}

      {budgetWindows.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SectionHeading>Budget windows closing soon</SectionHeading>
            <Badge variant="warning">{budgetWindows.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Companies whose fiscal year is ending soon. Budget usually has to be
            spent before then, so reach out before the window closes.
          </p>
          <BudgetWindowsCard rows={budgetWindows} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading>Stalled deals</SectionHeading>
        <p className="text-sm text-muted-foreground">
          Active deals past their stage&apos;s staleness SLA - later stages get
          tighter windows (negotiating 3d, prospect 14d).
        </p>
        <StalledDealsList />
      </section>
    </div>
  );
}
