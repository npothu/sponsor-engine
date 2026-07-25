import "server-only";
import { subDays, addDays, formatISO } from "date-fns";
import {
  getCurrentCycle,
  listDealsWithCompany,
  listAllOpenDeliverables,
  stalledDeals,
  revenueSummary,
  listTiers,
  fulfillmentHealth,
  lossReasonBreakdown,
  type DealWithCompany,
  type DeliverableWithContext,
  type StalledDeal,
  type RevenueSummary,
  type FulfillmentHealthRow,
  type LossReasonBucket,
} from "@/lib/data";
import type { DealStage, Tier } from "@/lib/schema";

/**
 * Data assembly for the exec-board report. Board-safe: everything returned
 * here is presentation-grade (company names, dollars, dates) and deliberately
 * excludes contact-level detail (emails, phone numbers, contact names).
 */

export const REPORT_STAGE_ORDER: readonly DealStage[] = [
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

export const REPORT_STAGE_LABEL: Record<DealStage, string> = {
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

const WON_STAGES: readonly DealStage[] = ["committed", "fulfilling", "renewed"];

const RECENT_WIN_WINDOW_DAYS = 60;
const UPCOMING_DELIVERABLE_WINDOW_DAYS = 30;
const STALL_DAYS = 10;

export interface PipelineStageRow {
  stage: DealStage;
  label: string;
  companies: Array<{ id: number; name: string }>;
  dollars: number;
}

export interface RecentWin {
  dealId: number;
  companyId: number;
  companyName: string;
  stage: DealStage;
  stageLabel: string;
  tierName: string | null;
  askAmount: number | null;
  stageEnteredAt: string;
}

export interface UpcomingDeliverableRow {
  id: number;
  title: string;
  owner: string | null;
  dueDate: string | null;
  companyId: number;
  companyName: string;
  status: DeliverableWithContext["status"];
}

export interface RiskDeal {
  dealId: number;
  companyId: number;
  companyName: string;
  stage: DealStage;
  stageLabel: string;
  daysStale: number;
  lastActivityAt: string;
}

export interface ReportData {
  cycle: string;
  generatedAt: string;
  revenue: RevenueSummary;
  anchorTier: Tier | null;
  pipeline: PipelineStageRow[];
  recentWins: RecentWin[];
  upcomingDeliverables: UpcomingDeliverableRow[];
  risks: RiskDeal[];
  fulfillmentHealth: FulfillmentHealthRow[];
  lossReasons: LossReasonBucket[];
}

/**
 * Assemble the full board-safe report snapshot for the given cycle (defaults
 * to the active cycle). Pure read - no mutations, safe to call from a server
 * component or a server action generating a static HTML export.
 */
export async function getReportData(cycle?: string): Promise<ReportData> {
  const activeCycle = cycle ?? (await getCurrentCycle());
  const generatedAt = formatISO(new Date());

  const revenue = await revenueSummary(activeCycle);

  const activeTiers = await listTiers(true);
  const anchorTier =
    [...activeTiers].sort((a, b) => b.price - a.price)[0] ?? null;

  const cycleDeals = await listDealsWithCompany(activeCycle);

  // Pipeline table: stage -> companies + dollars, board-safe (name only).
  const byStage = new Map<DealStage, DealWithCompany[]>();
  for (const stage of REPORT_STAGE_ORDER) byStage.set(stage, []);
  for (const deal of cycleDeals) {
    const bucket = byStage.get(deal.stage as DealStage);
    if (bucket) bucket.push(deal);
  }
  const pipeline: PipelineStageRow[] = REPORT_STAGE_ORDER.map((stage) => {
    const deals = byStage.get(stage) ?? [];
    return {
      stage,
      label: REPORT_STAGE_LABEL[stage],
      companies: deals.map((d) => ({ id: d.company.id, name: d.company.name })),
      dollars: deals.reduce((sum, d) => sum + (d.askAmount ?? 0), 0),
    };
  });

  // Recent wins: deals that reached committed+ within the last 60 days.
  const winCutoff = formatISO(subDays(new Date(), RECENT_WIN_WINDOW_DAYS));
  const recentWins: RecentWin[] = cycleDeals
    .filter(
      (d) =>
        WON_STAGES.includes(d.stage as DealStage) &&
        d.stageEnteredAt >= winCutoff,
    )
    .sort((a, b) => (a.stageEnteredAt < b.stageEnteredAt ? 1 : -1))
    .map((d) => ({
      dealId: d.id,
      companyId: d.company.id,
      companyName: d.company.name,
      stage: d.stage as DealStage,
      stageLabel: REPORT_STAGE_LABEL[d.stage as DealStage],
      tierName: d.tier?.name ?? null,
      askAmount: d.askAmount,
      stageEnteredAt: d.stageEnteredAt,
    }));

  // Upcoming deliverables: open/blocked, due within the next 30 days
  // (deliverables with no due date are excluded from this board view).
  const deliverableCutoff = formatISO(
    addDays(new Date(), UPCOMING_DELIVERABLE_WINDOW_DAYS),
    { representation: "date" },
  );
  const today = formatISO(new Date(), { representation: "date" });
  const upcomingDeliverables: UpcomingDeliverableRow[] = (await listAllOpenDeliverables())
    .filter((d) => d.dueDate != null && d.dueDate <= deliverableCutoff)
    .sort((a, b) => {
      const aDue = a.dueDate ?? "";
      const bDue = b.dueDate ?? "";
      return aDue < bDue ? -1 : aDue > bDue ? 1 : 0;
    })
    .map((d) => ({
      id: d.id,
      title: d.title,
      owner: d.owner,
      dueDate: d.dueDate,
      companyId: d.company.id,
      companyName: d.company.name,
      status: d.status,
    }));
  void today; // reserved for potential "overdue" styling in the view layer

  // Stalled / risk deals in the active cycle.
  const stalledInCycle: StalledDeal[] = (await stalledDeals(STALL_DAYS)).filter(
    (d) => d.cycle === activeCycle,
  );
  const risks: RiskDeal[] = stalledInCycle.map((d) => ({
    dealId: d.id,
    companyId: d.company.id,
    companyName: d.company.name,
    stage: d.stage as DealStage,
    stageLabel: REPORT_STAGE_LABEL[d.stage as DealStage],
    daysStale: d.daysStale,
    lastActivityAt: d.lastActivityAt,
  }));

  return {
    cycle: activeCycle,
    generatedAt,
    revenue,
    anchorTier,
    pipeline,
    recentWins,
    upcomingDeliverables,
    risks,
    fulfillmentHealth: await fulfillmentHealth(activeCycle),
    lossReasons: await lossReasonBreakdown(activeCycle),
  };
}
