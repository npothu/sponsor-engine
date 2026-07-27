import {
  listDealsWithCompany,
  stalledDeals,
  dealsMissingNextAction,
  getActiveCycleAnchor,
  isTightOnTime,
  type DealWithCompany,
  type StaleSeverity,
} from "@/lib/data";
import Link from "next/link";
import type { DealStage } from "@/lib/schema";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AnchorCountdown } from "@/components/dashboard/anchor-countdown";
import { BoardFilters } from "./board-filters";
import { StageArrows } from "./stage-arrows";

/** Ordered columns shown as the main kanban. renewed/lapsed live in the footer. */
const COLUMN_STAGES: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
];

const FOOTER_STAGES: readonly DealStage[] = ["renewed", "lapsed", "rejected"];

/** Full stage order, used to compute prev/next moves across every stage. */
const ALL_STAGES: readonly DealStage[] = [...COLUMN_STAGES, ...FOOTER_STAGES];

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

/** Per-deal staleness state derived from the SLA map, keyed by deal id. */
interface StaleInfo {
  daysStale: number;
  daysOverSla: number;
  slaDays: number;
  severity: StaleSeverity;
}

/** Maps a tier's display name to the Badge tier variant, when it matches. */
function tierBadgeVariant(
  tierName: string,
): "silver" | "gold" | "platinum" | "outline" {
  const key = tierName.trim().toLowerCase();
  if (key === "silver") return "silver";
  if (key === "gold") return "gold";
  if (key === "platinum") return "platinum";
  return "outline";
}

function formatDollars(amount: number | null): string {
  if (amount == null) return "-";
  return `$${amount.toLocaleString("en-US")}`;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

interface BoardSearchParams {
  type?: string;
  cycle?: string;
  priority?: string;
  warm?: string;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<BoardSearchParams>;
}) {
  const sp = await searchParams;
  const typeParam =
    sp.type === "corporate" || sp.type === "community" ? sp.type : "all";
  const cycleParam = sp.cycle ?? "";
  const priorityParam =
    sp.priority === "high" || sp.priority === "medium" || sp.priority === "low"
      ? sp.priority
      : "all";
  const warmOnly = sp.warm === "1";

  const anchor = await getActiveCycleAnchor();

  // Pull the full set once to derive available cycles, then filter in memory.
  const allDeals = await listDealsWithCompany();
  const cycles = Array.from(new Set(allDeals.map((d) => d.cycle))).sort((a, b) =>
    b.localeCompare(a),
  );

  const staleById = new Map<number, StaleInfo>(
    (await stalledDeals()).map((d) => [
      d.id,
      {
        daysStale: d.daysStale,
        daysOverSla: d.daysOverSla,
        slaDays: d.slaDays,
        severity: d.severity,
      },
    ]),
  );
  const missingActionIds = new Set((await dealsMissingNextAction()).map((d) => d.id));

  const deals = allDeals.filter((d) => {
    if (typeParam !== "all" && d.company.type !== typeParam) return false;
    if (cycleParam && d.cycle !== cycleParam) return false;
    if (priorityParam !== "all" && d.company.priority !== priorityParam)
      return false;
    if (
      warmOnly &&
      !d.hasWarmPath &&
      d.topContactWarmth !== "warm" &&
      d.topContactWarmth !== "hot"
    )
      return false;
    return true;
  });

  const byStage = new Map<DealStage, DealWithCompany[]>();
  for (const stage of ALL_STAGES) byStage.set(stage, []);
  for (const deal of deals) {
    const bucket = byStage.get(deal.stage as DealStage);
    if (bucket) bucket.push(deal);
  }

  const totalDeals = deals.length;
  const footerCount = FOOTER_STAGES.reduce(
    (sum, s) => sum + (byStage.get(s)?.length ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Board"
        subtitle="Kanban view of deals across pipeline stages."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AnchorCountdown anchor={anchor} compact />
            <BoardFilters
              type={typeParam}
              cycle={cycleParam}
              priority={priorityParam}
              warmOnly={warmOnly}
              cycles={cycles}
            />
          </div>
        }
      />

      {totalDeals === 0 ? (
        <Card className="items-center border-dashed px-6 py-12 text-center">
          <p className="font-display text-base font-semibold text-foreground">
            No deals to show
          </p>
          <p className="text-sm text-muted-foreground">
            {allDeals.length === 0
              ? "Create a deal on a company to start tracking it through the pipeline."
              : "No deals match the current filters. Try widening the partnership type, cycle, or priority."}
          </p>
        </Card>
      ) : (
        <>
          <div className="-mx-7 overflow-x-auto px-7 pb-2">
            <div className="flex min-w-min items-start gap-3.5">
              {COLUMN_STAGES.map((stage) => (
                <BoardColumn
                  key={stage}
                  stage={stage}
                  deals={byStage.get(stage) ?? []}
                  staleById={staleById}
                  missingActionIds={missingActionIds}
                  daysToEvent={anchor.daysRemaining}
                />
              ))}
            </div>
          </div>

          <BoardFooter
            renewed={byStage.get("renewed") ?? []}
            lapsed={byStage.get("lapsed") ?? []}
            rejected={byStage.get("rejected") ?? []}
            count={footerCount}
            staleById={staleById}
            missingActionIds={missingActionIds}
            daysToEvent={anchor.daysRemaining}
          />
        </>
      )}
    </div>
  );
}

function columnAsk(deals: DealWithCompany[]): number {
  return deals.reduce((sum, d) => sum + (d.askAmount ?? 0), 0);
}

function BoardColumn({
  stage,
  deals,
  staleById,
  missingActionIds,
  daysToEvent,
}: {
  stage: DealStage;
  deals: DealWithCompany[];
  staleById: Map<number, StaleInfo>;
  missingActionIds: Set<number>;
  daysToEvent: number | null;
}) {
  const totalAsk = columnAsk(deals);
  return (
    <section
      className="flex min-w-[240px] max-w-[300px] flex-1 shrink-0 basis-[240px] flex-col rounded-xl bg-muted"
      aria-label={STAGE_LABELS[stage]}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
          {STAGE_LABELS[stage]}
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="secondary">{deals.length}</Badge>
          <span className="text-xs font-semibold tabular-nums text-primary dark:text-lime">
            {formatDollars(totalAsk)}
          </span>
        </span>
      </header>
      <div className="flex min-h-[60px] flex-col gap-2.5 p-3">
        {deals.length === 0 ? (
          <p className="py-3.5 text-center text-sm text-muted-foreground">
            No deals
          </p>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              stale={staleById.get(deal.id) ?? null}
              missingAction={missingActionIds.has(deal.id)}
              daysToEvent={daysToEvent}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  stale,
  missingAction,
  daysToEvent,
}: {
  deal: DealWithCompany;
  stale: StaleInfo | null;
  missingAction: boolean;
  daysToEvent: number | null;
}) {
  const stage = deal.stage as DealStage;
  const idx = ALL_STAGES.indexOf(stage);
  const prevStage = idx > 0 ? ALL_STAGES[idx - 1] : null;
  const nextStage =
    idx >= 0 && idx < ALL_STAGES.length - 1 ? ALL_STAGES[idx + 1] : null;
  const daysInStage = daysSince(deal.stageEnteredAt);
  const tightOnTime = isTightOnTime(stage, daysToEvent);

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(28,55,32,0.04)]">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/companies/${deal.company.id}`}
          className="font-semibold leading-tight text-foreground underline-offset-4 hover:underline"
        >
          {deal.company.name}
        </Link>
        <span className="whitespace-nowrap font-display font-bold text-primary dark:text-foreground">
          {formatDollars(deal.askAmount)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {deal.tier ? (
          <Badge variant={tierBadgeVariant(deal.tier.name)}>
            {deal.tier.name}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-dashed">
            No tier
          </Badge>
        )}
        <Badge variant="secondary">{deal.cycle}</Badge>
        {deal.topContactWarmth === "hot" && (
          <Badge variant="destructive" title="Has a hot contact">
            Hot contact
          </Badge>
        )}
        {deal.topContactWarmth === "warm" && (
          <Badge variant="warning" title="Has a warm contact">
            Warm contact
          </Badge>
        )}
        {deal.hasWarmPath && (
          <Badge
            variant="info"
            title="This company has a warm introduction path available"
          >
            Warm path
          </Badge>
        )}
        {!deal.hasDecisionMaker && (
          <Badge
            variant="outline"
            className="border-dashed"
            title="No champion or budget-holder contact yet - this deal is single-threaded and cannot reach someone who can say yes"
          >
            Single-threaded
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="text-xs tabular-nums text-muted-foreground"
          title="Days in current stage"
        >
          {daysInStage}d in stage
        </span>
        {stale && (
          <Badge
            variant={stale.severity === "critical" ? "destructive" : "warning"}
            title={`${stale.daysStale} days since last activity, ${stale.daysOverSla}d past the ${stale.slaDays}d SLA for this stage`}
          >
            {stale.severity === "critical" ? "Critically stalled" : "Stalled"} +
            {stale.daysOverSla}d
          </Badge>
        )}
        {missingAction && (
          <Badge
            variant="destructive"
            title="This active deal has no open next action"
          >
            No next action
          </Badge>
        )}
        {tightOnTime && (
          <Badge
            variant="warning"
            title={`Only ${daysToEvent}d to the anchor event - less than this stage typically needs to close`}
          >
            Tight on time
          </Badge>
        )}
      </div>

      <div className="mt-0.5 flex justify-end">
        <StageArrows
          dealId={deal.id}
          prevStage={prevStage}
          nextStage={nextStage}
          prevLabel={prevStage ? STAGE_LABELS[prevStage] : null}
          nextLabel={nextStage ? STAGE_LABELS[nextStage] : null}
          isProspect={stage === "prospect"}
        />
      </div>
    </article>
  );
}

function BoardFooter({
  renewed,
  lapsed,
  rejected,
  count,
  staleById,
  missingActionIds,
  daysToEvent,
}: {
  renewed: DealWithCompany[];
  lapsed: DealWithCompany[];
  rejected: DealWithCompany[];
  count: number;
  staleById: Map<number, StaleInfo>;
  missingActionIds: Set<number>;
  daysToEvent: number | null;
}) {
  if (count === 0) return null;
  return (
    <section
      className="flex flex-col gap-3.5 border-t border-border pt-4"
      aria-label="Closed cycles"
    >
      <div className="flex items-center">
        <span className="font-display text-lg font-semibold text-primary dark:text-foreground">
          Closed cycles
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
        <FooterGroup
          label="Renewed"
          deals={renewed}
          staleById={staleById}
          missingActionIds={missingActionIds}
          daysToEvent={daysToEvent}
        />
        <FooterGroup
          label="Lapsed"
          deals={lapsed}
          staleById={staleById}
          missingActionIds={missingActionIds}
          daysToEvent={daysToEvent}
        />
        <FooterGroup
          label="Rejected"
          deals={rejected}
          staleById={staleById}
          missingActionIds={missingActionIds}
          daysToEvent={daysToEvent}
        />
      </div>
    </section>
  );
}

function FooterGroup({
  label,
  deals,
  staleById,
  missingActionIds,
  daysToEvent,
}: {
  label: string;
  deals: DealWithCompany[];
  staleById: Map<number, StaleInfo>;
  missingActionIds: Set<number>;
  daysToEvent: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted p-3.5">
      <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-2.5">
        <span className="mr-auto text-[11px] font-bold uppercase tracking-wide text-foreground">
          {label}
        </span>
        <Badge variant="secondary">{deals.length}</Badge>
        <span className="text-xs font-semibold tabular-nums text-primary dark:text-lime">
          {formatDollars(columnAsk(deals))}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {deals.length === 0 ? (
          <p className="py-3.5 text-center text-sm text-muted-foreground">
            None
          </p>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              stale={staleById.get(deal.id) ?? null}
              missingAction={missingActionIds.has(deal.id)}
              daysToEvent={daysToEvent}
            />
          ))
        )}
      </div>
    </div>
  );
}
