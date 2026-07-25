import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, deals, deckVersions, touchpoints } from "@/lib/schema";
import {
  ACTIVE_STAGES,
  getCompanyDetail,
  listAllOpenDeliverables,
  listDueActions,
  type CompanyDetail,
  type DueAction,
  type DeliverableWithContext,
  type TouchpointDetail,
} from "@/lib/data";
import type { Company, DealStage } from "@/lib/schema";

/**
 * lib/data.ts has no "companies that actually have a deal" query (listCompanies
 * returns every company regardless of pipeline history). The handoff doc only
 * covers companies with at least one deal, so this small helper reads the
 * distinct company ids off the deals table directly.
 */
export async function listCompaniesWithDeals(): Promise<Company[]> {
  const rows = await db
    .selectDistinct({ company: companies })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .orderBy(companies.name)
    .all();
  return rows.map((r) => r.company);
}

/** Every company's full state-of-the-relationship bundle, in company-name order. */
export interface RelationshipState {
  detail: CompanyDetail;
  latestTouchpoint: TouchpointDetail | null;
  touchpointCount: number;
  firstTouchAt: string | null;
  lastTouchAt: string | null;
  deliverables: DeliverableWithContext[];
}

export async function buildRelationshipState(company: Company): Promise<RelationshipState> {
  const detail = await getCompanyDetail(company.id);
  if (!detail) {
    throw new Error(`buildRelationshipState: company ${company.id} not found`);
  }
  const touchpointCount = detail.touchpoints.length;
  const occurredAts = detail.touchpoints.map((t) => t.occurredAt).sort();
  const firstTouchAt = occurredAts[0] ?? null;
  const lastTouchAt = occurredAts[occurredAts.length - 1] ?? null;
  const dealIds = new Set(detail.deals.map((d) => d.id));
  const deliverables = (await listAllOpenDeliverables()).filter((d) =>
    dealIds.has(d.dealId),
  );

  return {
    detail,
    latestTouchpoint: detail.touchpoints[0] ?? null,
    touchpointCount,
    firstTouchAt,
    lastTouchAt,
    deliverables,
  };
}

/** Active-stage deals joined with company + their latest touchpoint and next action, for the org summary's "top open threads". */
export interface OpenThread {
  companyId: number;
  companyName: string;
  dealId: number;
  stage: DealStage;
  cycle: string;
  askAmount: number | null;
  latestTouchpoint: TouchpointDetail | null;
  nextAction: DueAction | null;
}

export async function listTopOpenThreads(cycle: string, limit = 8): Promise<OpenThread[]> {
  const rows = (
    await db
      .select({ deal: deals, company: companies })
      .from(deals)
      .innerJoin(companies, eq(deals.companyId, companies.id))
      .where(
        eq(deals.cycle, cycle),
      )
      .all()
  ).filter((r) => (ACTIVE_STAGES as readonly string[]).includes(r.deal.stage));

  const dealIds = rows.map((r) => r.deal.id);
  const lastTouchByDeal = new Map<number, TouchpointDetail>();
  if (dealIds.length) {
    const touchRows = await db
      .select({ touchpoint: touchpoints, deckVersion: deckVersions })
      .from(touchpoints)
      .leftJoin(deckVersions, eq(touchpoints.deckVersionId, deckVersions.id))
      .where(inArray(touchpoints.dealId, dealIds))
      .orderBy(desc(touchpoints.occurredAt))
      .all();
    for (const r of touchRows) {
      const dealId = r.touchpoint.dealId;
      if (dealId != null && !lastTouchByDeal.has(dealId)) {
        lastTouchByDeal.set(dealId, {
          ...r.touchpoint,
          deckVersion: r.deckVersion ?? null,
          contact: null,
        });
      }
    }
  }

  const dueActions = await listDueActions();
  const nextActionByDeal = new Map<number, DueAction>();
  for (const a of dueActions) {
    if (!nextActionByDeal.has(a.dealId)) nextActionByDeal.set(a.dealId, a);
  }

  const threads: OpenThread[] = rows.map((r) => ({
    companyId: r.company.id,
    companyName: r.company.name,
    dealId: r.deal.id,
    stage: r.deal.stage as DealStage,
    cycle: r.deal.cycle,
    askAmount: r.deal.askAmount,
    latestTouchpoint: lastTouchByDeal.get(r.deal.id) ?? null,
    nextAction: nextActionByDeal.get(r.deal.id) ?? null,
  }));

  // Prioritize deals with the most forward pipeline movement (stage order) and
  // recent activity, since those are the threads a successor most needs to see.
  const stageOrder: Record<DealStage, number> = {
    prospect: 0,
    outreach: 1,
    conversation: 2,
    pitched: 3,
    negotiating: 4,
    committed: 5,
    fulfilling: 6,
    renewed: 7,
    lapsed: -1,
    rejected: -1,
  };
  threads.sort((a, b) => stageOrder[b.stage] - stageOrder[a.stage]);
  return threads.slice(0, limit);
}

/** ISO date -> "Jan 3, 2026"-style label for on-screen and Markdown display. */
export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  // A date-only string ("2026-07-09") must be read as local midnight; otherwise
  // `new Date(...)` parses it as UTC and it shifts a day earlier in negative-
  // offset timezones. Full ISO timestamps (with a time/offset) parse fine.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
  const d = dateOnly
    ? (() => {
        const [y, m, day] = iso.trim().split("-").map(Number);
        return new Date(y, m - 1, day);
      })()
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDollars(amount: number | null): string {
  if (amount == null) return "-";
  return `$${amount.toLocaleString("en-US")}`;
}

export function stageLabel(stage: string): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  career_fair: "Career fair",
  linkedin: "LinkedIn",
  discord: "Discord",
  other: "Other",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}
