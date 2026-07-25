import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  deals,
  nextActions,
  tiers,
  touchpoints,
  type Company,
  type Tier,
} from "@/lib/schema";
import { listCompanies, type CompanyFilter } from "@/lib/data";

/**
 * Feature-local read helpers that assemble the exact shape the companies list
 * table needs. lib/data.ts exposes listCompanies() and getCompanyDetail() but
 * no single query joining a company to its primary deal, last touch, and next
 * due action - so we compose that here directly against drizzle.
 */

export interface CompanyRow {
  company: Company;
  /** The most-recently-created deal for the company (the "primary" deal). */
  dealId: number | null;
  cycle: string | null;
  stage: string | null;
  askAmount: number | null;
  tier: Tier | null;
  lastTouchAt: string | null;
  nextActionTitle: string | null;
  nextActionDue: string | null;
}

export async function listCompanyRows(filter?: CompanyFilter): Promise<CompanyRow[]> {
  const cos = await listCompanies(filter);
  if (cos.length === 0) return [];
  const ids = cos.map((c) => c.id);

  // Primary deal per company = latest by createdAt. Pull all deals for these
  // companies (small dataset) and pick the newest per company in JS.
  const dealRows = await db
    .select({ deal: deals, tier: tiers })
    .from(deals)
    .leftJoin(tiers, eq(deals.targetTierId, tiers.id))
    .where(inArray(deals.companyId, ids))
    .orderBy(desc(deals.createdAt))
    .all();

  const primaryByCompany = new Map<number, (typeof dealRows)[number]>();
  for (const r of dealRows) {
    if (!primaryByCompany.has(r.deal.companyId)) {
      primaryByCompany.set(r.deal.companyId, r);
    }
  }

  // Last touchpoint per company.
  const lastTouchRows = await db
    .select({
      companyId: touchpoints.companyId,
      lastAt: sql<string>`max(${touchpoints.occurredAt})`.as("last_at"),
    })
    .from(touchpoints)
    .where(inArray(touchpoints.companyId, ids))
    .groupBy(touchpoints.companyId)
    .all();
  const lastTouchByCompany = new Map<number, string>();
  for (const r of lastTouchRows) lastTouchByCompany.set(r.companyId, r.lastAt);

  // Next open action (soonest due) per company, via its deals.
  const dealIds = dealRows.map((r) => r.deal.id);
  const dealToCompany = new Map<number, number>();
  for (const r of dealRows) dealToCompany.set(r.deal.id, r.deal.companyId);

  const actionRows = dealIds.length
    ? await db
        .select()
        .from(nextActions)
        .where(
          and(
            inArray(nextActions.dealId, dealIds),
            eq(nextActions.status, "open"),
          ),
        )
        .orderBy(nextActions.dueDate)
        .all()
    : [];
  const nextActionByCompany = new Map<
    number,
    { title: string; dueDate: string }
  >();
  for (const a of actionRows) {
    const companyId = dealToCompany.get(a.dealId);
    if (companyId == null) continue;
    if (!nextActionByCompany.has(companyId)) {
      nextActionByCompany.set(companyId, { title: a.title, dueDate: a.dueDate });
    }
  }

  return cos.map((company) => {
    const primary = primaryByCompany.get(company.id);
    const action = nextActionByCompany.get(company.id);
    return {
      company,
      dealId: primary?.deal.id ?? null,
      cycle: primary?.deal.cycle ?? null,
      stage: primary?.deal.stage ?? null,
      askAmount: primary?.deal.askAmount ?? null,
      tier: primary?.tier ?? null,
      lastTouchAt: lastTouchByCompany.get(company.id) ?? null,
      nextActionTitle: action?.title ?? null,
      nextActionDue: action?.dueDate ?? null,
    };
  });
}
