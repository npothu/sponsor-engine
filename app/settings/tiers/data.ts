import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, deals } from "@/lib/schema";

/**
 * lib/data.ts has no query for "deals targeting a given tier" - this is a
 * small local helper for the tiers settings screen, reading straight from
 * lib/db + lib/schema per the feature-agent API-gap convention.
 */

export interface DealTargetingTier {
  dealId: number;
  companyId: number;
  companyName: string;
  cycle: string;
  stage: string;
}

/** Map of tierId -> deals currently targeting that tier, across all cycles. */
export async function listDealsByTargetTier(): Promise<Map<number, DealTargetingTier[]>> {
  const rows = await db
    .select({
      dealId: deals.id,
      tierId: deals.targetTierId,
      companyId: companies.id,
      companyName: companies.name,
      cycle: deals.cycle,
      stage: deals.stage,
    })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .all();

  const map = new Map<number, DealTargetingTier[]>();
  for (const row of rows) {
    if (row.tierId == null) continue;
    const list = map.get(row.tierId) ?? [];
    list.push({
      dealId: row.dealId,
      companyId: row.companyId,
      companyName: row.companyName,
      cycle: row.cycle,
      stage: row.stage,
    });
    map.set(row.tierId, list);
  }
  return map;
}
