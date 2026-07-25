import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, touchpoints, type Company } from "@/lib/schema";

/**
 * A company alongside the timestamp of the touchpoint where they most
 * recently saw this specific deck version.
 */
export interface DeckVersionCompany {
  company: Company;
  sharedAt: string;
}

/**
 * Companies whose latest deck-bearing touchpoint referenced this deck
 * version. Mirrors the "latest deck touch per company" logic used by
 * companiesOnOutdatedDeck in lib/data.ts, but scoped to one version and
 * not restricted to non-current versions.
 *
 * This is a gap in lib/data.ts (no per-version company listing exists),
 * so it is implemented locally against lib/db + lib/schema per the
 * house rule for feature agents.
 */
export async function companiesForDeckVersion(deckVersionId: number): Promise<DeckVersionCompany[]> {
  const latestDeckTouch = db
    .select({
      companyId: touchpoints.companyId,
      lastAt: sql<string>`max(${touchpoints.occurredAt})`.as("last_at"),
    })
    .from(touchpoints)
    .where(sql`${touchpoints.deckVersionId} is not null`)
    .groupBy(touchpoints.companyId)
    .as("latest_deck_touch");

  const rows = await db
    .select({
      company: companies,
      sharedAt: touchpoints.occurredAt,
    })
    .from(touchpoints)
    .innerJoin(
      latestDeckTouch,
      and(
        eq(latestDeckTouch.companyId, touchpoints.companyId),
        eq(latestDeckTouch.lastAt, touchpoints.occurredAt),
      ),
    )
    .innerJoin(companies, eq(companies.id, touchpoints.companyId))
    .where(eq(touchpoints.deckVersionId, deckVersionId))
    .orderBy(companies.name)
    .all();

  return rows.map((r) => ({ company: r.company, sharedAt: r.sharedAt }));
}
