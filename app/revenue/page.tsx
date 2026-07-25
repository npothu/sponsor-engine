import {
  funnelForecast,
  getCurrentCycle,
  listCycles,
  listDealsWithCompany,
  listTiers,
  revenueSummary,
  STAGE_WEIGHTS,
  type DealWithCompany,
} from "@/lib/data";
import type { CompanyType, DealStage } from "@/lib/schema";
import { CycleSelect } from "./cycle-select";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAGE_LABELS: Record<DealStage, string> = {
  prospect: "Prospect",
  outreach: "Outreach",
  conversation: "Conversation",
  pitched: "Pitched",
  negotiating: "Negotiating",
  committed: "Committed",
  fulfilling: "Fulfilling",
  renewed: "Renewed",
  lapsed: "Lapsed",
  rejected: "Rejected",
};

const STAGE_ORDER: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
  "rejected",
];

const TYPE_LABELS: Record<CompanyType, string> = {
  corporate: "Corporate",
  community: "Community",
};

function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function formatPct(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

interface RevenueSearchParams {
  cycle?: string;
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<RevenueSearchParams>;
}) {
  const sp = await searchParams;
  const currentCycle = await getCurrentCycle();

  const allCycles = await listCycles();
  const cycleLabels = Array.from(
    new Set([currentCycle, ...allCycles.map((c) => c.label)]),
  ).sort((a, b) => b.localeCompare(a));

  const cycle =
    sp.cycle && cycleLabels.includes(sp.cycle) ? sp.cycle : currentCycle;

  const summary = await revenueSummary(cycle);
  const funnel = await funnelForecast(cycle);
  const maxFunnelEntered = Math.max(1, ...funnel.stages.map((s) => s.entered));
  const activeTiers = await listTiers(true);
  const anchorTier = [...activeTiers].sort((a, b) => b.price - a.price)[0] ?? null;

  const dealsInCycle = await listDealsWithCompany(cycle);
  const weightedRows = dealsInCycle
    .map((deal) => ({
      deal,
      weightedValue: computeWeightedValue(deal),
    }))
    .sort((a, b) => b.weightedValue - a.weightedValue);

  const goalPct =
    summary.goal > 0
      ? Math.min(100, Math.round((summary.committedTotal / summary.goal) * 100))
      : 0;

  const anchorSlots = Math.max(summary.anchorTarget, summary.anchorCount);

  const byStageMap = new Map(summary.byStage.map((s) => [s.stage, s]));
  const byTypeMap = new Map(summary.byType.map((t) => [t.type, t]));
  const maxStageDollar = Math.max(
    1,
    ...summary.byStage.map((s) => s.committed + s.weighted),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        subtitle="Committed dollars, weighted pipeline, and anchor progress for the cycle."
        actions={<CycleSelect cycle={cycle} cycles={cycleLabels} />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="gap-2 px-5 py-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Committed
          </span>
          <span className="font-display text-2xl font-bold text-primary dark:text-foreground">
            {formatDollars(summary.committedTotal)}
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sum of ask amounts for committed, fulfilling, and renewed deals in{" "}
            {cycle}.
          </p>
        </Card>

        <Card className="gap-2 px-5 py-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Weighted pipeline
          </span>
          <span className="font-display text-2xl font-bold text-primary dark:text-foreground">
            {formatDollars(summary.weightedPipeline)}
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Open-stage ask amounts multiplied by stage probability: prospect{" "}
            {formatPct(STAGE_WEIGHTS.prospect ?? 0)}, outreach{" "}
            {formatPct(STAGE_WEIGHTS.outreach ?? 0)}, conversation{" "}
            {formatPct(STAGE_WEIGHTS.conversation ?? 0)}, pitched{" "}
            {formatPct(STAGE_WEIGHTS.pitched ?? 0)}, negotiating{" "}
            {formatPct(STAGE_WEIGHTS.negotiating ?? 0)}. Committed-and-beyond
            deals count toward Committed instead.
          </p>
        </Card>

        <Card className="gap-2 px-5 py-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Goal
          </span>
          <span className="font-display text-2xl font-bold text-primary dark:text-foreground">
            {summary.goal > 0 ? formatDollars(summary.goal) : "Not set"}
          </span>
          {summary.goal > 0 ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="gradient-brand h-full rounded-full transition-[width]"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {goalPct}% of goal committed ({formatDollars(summary.committedTotal)}{" "}
                of {formatDollars(summary.goal)}).
              </p>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Set a revenue goal in Settings to track progress here.
            </p>
          )}
        </Card>
      </div>

      <Card className="gap-3 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading>Anchor tracker</SectionHeading>
          <span className="text-sm font-semibold text-primary dark:text-foreground">
            {summary.anchorCount} of {summary.anchorTarget || anchorSlots}{" "}
            {anchorTier ? anchorTier.name : "Gold"}-level sponsors
          </span>
        </div>
        {anchorSlots > 0 ? (
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            {Array.from({ length: anchorSlots }).map((_, i) => (
              <span
                key={i}
                className={
                  i < summary.anchorCount
                    ? "size-[34px] rounded-lg border border-primary/40 bg-lime/70 shadow-[0_0_0_3px_rgba(124,179,66,0.18)]"
                    : "size-[34px] rounded-lg border border-dashed border-border bg-muted"
                }
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Set an anchor target in Settings to render slots here.
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Counts committed-and-beyond deals in {cycle} targeting{" "}
          {anchorTier ? anchorTier.name : "the top active tier"} (
          {anchorTier ? formatDollars(anchorTier.price) : "the anchor tier"}), the
          anchor tier for the Spring hackathon.
        </p>
      </Card>

      <section className="space-y-3">
        <SectionHeading>By stage</SectionHeading>
        <Card className="gap-3 px-5 py-5">
          {STAGE_ORDER.map((stage) => {
            const row = byStageMap.get(stage);
            const count = row?.count ?? 0;
            const committed = row?.committed ?? 0;
            const weighted = row?.weighted ?? 0;
            const total = committed + weighted;
            const barPct = Math.round((total / maxStageDollar) * 100);
            return (
              <div
                key={stage}
                className="grid grid-cols-[120px_70px_1fr_90px] items-center gap-3"
              >
                <span className="text-sm font-semibold text-foreground">
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {count} deal{count === 1 ? "" : "s"}
                </span>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      committed > 0
                        ? "h-full rounded-full bg-lime"
                        : "h-full rounded-full bg-info/75"
                    }
                    style={{ width: `${Math.max(total > 0 ? 2 : 0, barPct)}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold text-foreground">
                  {committed > 0
                    ? formatDollars(committed)
                    : weighted > 0
                      ? formatDollars(weighted)
                      : "-"}
                </span>
              </div>
            );
          })}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading>Conversion funnel &amp; forecast</SectionHeading>
        <Card className="gap-4 px-5 py-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            From the stage-event log: how many deals in {cycle} entered each stage
            and the share that advanced to the next. Forecast projects the
            startable prospect pool against the goal at the historical
            prospect-to-committed rate.
          </p>

          <div className="space-y-2.5">
            {funnel.stages.map((s, i) => {
              const barPct = Math.round((s.entered / maxFunnelEntered) * 100);
              const next = funnel.stages[i + 1];
              return (
                <div
                  key={s.stage}
                  className="grid grid-cols-[120px_1fr_54px_120px] items-center gap-3"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {STAGE_LABELS[s.stage]}
                  </span>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="gradient-brand h-full rounded-full"
                      style={{ width: `${Math.max(s.entered > 0 ? 3 : 0, barPct)}%` }}
                    />
                  </div>
                  <span className="text-right text-sm font-semibold text-foreground">
                    {s.entered}
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    {next
                      ? `${formatPct(s.conversionToNext)} to ${STAGE_LABELS[next.stage].toLowerCase()}`
                      : "won"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Prospect &rarr; committed
              </span>
              <p className="font-display text-lg font-bold text-primary dark:text-foreground">
                {formatPct(funnel.effectiveRate)}
              </p>
              <p className="text-xs text-muted-foreground">
                {funnel.usedDefaultRate
                  ? `Default rate (only ${funnel.prospectsEntered} prospect${funnel.prospectsEntered === 1 ? "" : "s"} logged so far).`
                  : `Observed from ${funnel.prospectsEntered} prospects, ${funnel.committedReached} committed.`}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Startable pool
              </span>
              <p className="font-display text-lg font-bold text-primary dark:text-foreground">
                {funnel.startablePool}
              </p>
              <p className="text-xs text-muted-foreground">
                x {formatPct(funnel.effectiveRate)} x{" "}
                {formatDollars(funnel.avgCommittedAsk)} avg ask ={" "}
                {formatDollars(funnel.forecastFromPool)} forecast.
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Projected total
              </span>
              <p className="font-display text-lg font-bold text-primary dark:text-foreground">
                {formatDollars(funnel.projectedTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDollars(funnel.committedTotal)} committed +{" "}
                {formatDollars(funnel.forecastFromPool)} forecast.
              </p>
            </div>
          </div>

          {funnel.goal > 0 ? (
            funnel.shortfall > 0 ? (
              <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  You are {formatDollars(funnel.shortfall)} short of the{" "}
                  {formatDollars(funnel.goal)} goal.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  At the current prospect-to-committed rate that is about{" "}
                  {funnel.prospectsNeededForShortfall} more prospect
                  {funnel.prospectsNeededForShortfall === 1 ? "" : "s"} into the
                  funnel beyond the startable pool.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-lime/50 bg-lime/15 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  On track: the projected total covers the{" "}
                  {formatDollars(funnel.goal)} goal.
                </p>
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Set a revenue goal in Settings to see the shortfall and the prospects
              needed to close it.
            </p>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading>Corporate vs community</SectionHeading>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["corporate", "community"] as const).map((type) => {
            const row = byTypeMap.get(type);
            const count = row?.count ?? 0;
            const committed = row?.committed ?? 0;
            const weighted = row?.weighted ?? 0;
            return (
              <Card key={type} className="gap-2 px-5 py-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {TYPE_LABELS[type]}
                </span>
                <span className="font-display text-xl font-bold text-primary dark:text-foreground">
                  {formatDollars(committed)}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {count} deal{count === 1 ? "" : "s"} &middot; weighted{" "}
                  {formatDollars(weighted)}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading>Deals</SectionHeading>
        {weightedRows.length === 0 ? (
          <Card className="items-center border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No deals in {cycle} yet.
            </p>
          </Card>
        ) : (
          <Card className="gap-0 py-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Ask</TableHead>
                  <TableHead>Weighted value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weightedRows.map(({ deal, weightedValue }) => (
                  <TableRow key={deal.id}>
                    <TableCell>
                      <a
                        className="font-medium text-primary underline-offset-4 hover:underline dark:text-lime"
                        href={`/companies/${deal.company.id}`}
                      >
                        {deal.company.name}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        &middot; {TYPE_LABELS[deal.company.type as CompanyType]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge>{STAGE_LABELS[deal.stage as DealStage]}</Badge>
                    </TableCell>
                    <TableCell>
                      {deal.askAmount != null ? formatDollars(deal.askAmount) : "-"}
                    </TableCell>
                    <TableCell className="font-display font-bold text-primary dark:text-foreground">
                      {formatDollars(weightedValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

/** Committed-and-beyond deals count their full ask; earlier stages are weighted. */
function computeWeightedValue(deal: DealWithCompany): number {
  const ask = deal.askAmount ?? 0;
  const stage = deal.stage as DealStage;
  if (stage === "committed" || stage === "fulfilling" || stage === "renewed") {
    return ask;
  }
  const weight = STAGE_WEIGHTS[stage] ?? 0;
  return Math.round(ask * weight);
}
