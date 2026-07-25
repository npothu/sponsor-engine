/**
 * One-off script: clear all prospect-stage deals then seed the top 50
 * companies (by composite rank) as fresh prospect deals in the current cycle.
 *
 * Run with: npm run reset-prospects
 *
 * Safety: only touches deals whose stage = 'prospect'. Active pipeline deals
 * (outreach, conversation, pitched, negotiating, committed, fulfilling) are
 * never deleted. Companies are never deleted.
 */
import { eq, inArray } from "drizzle-orm";
import { db, ensureMigrated } from "../lib/db";
import {
  companies,
  companySignals,
  deals,
  nextActions,
  stageEvents,
  tiers,
  settings,
} from "../lib/schema";
import type { CompanyPriority } from "../lib/schema";

async function main(): Promise<void> {
  // lib/db.ts's async client no longer runs the idempotent schema migration
  // automatically on import (the old better-sqlite3 connection did) - callers
  // outside lib/data.ts's request path must await it explicitly once.
  await ensureMigrated();

  // ---------------------------------------------------------------------------
  // 1. Resolve current cycle
  // ---------------------------------------------------------------------------

  const [cycleRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "current_cycle"));
  const CYCLE = cycleRow?.value ?? "2026-27";
  console.log(`Current cycle: ${CYCLE}`);

  // ---------------------------------------------------------------------------
  // 2. Delete all prospect-stage deals (cascade: next_actions, stage_events)
  // ---------------------------------------------------------------------------

  const prospectDealRows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.stage, "prospect"));
  const prospectDealIds = prospectDealRows.map((r) => r.id);

  console.log(`Found ${prospectDealIds.length} prospect deal(s) to remove.`);

  if (prospectDealIds.length > 0) {
    await db
      .delete(nextActions)
      .where(inArray(nextActions.dealId, prospectDealIds));
    await db
      .delete(stageEvents)
      .where(inArray(stageEvents.dealId, prospectDealIds));
    await db.delete(deals).where(inArray(deals.id, prospectDealIds));
    console.log("Deleted prospect deals and their next_actions/stage_events.");
  }

  // ---------------------------------------------------------------------------
  // 3. Rank remaining eligible companies by composite score
  // ---------------------------------------------------------------------------

  // Companies that already have a pipeline deal (beyond prospect) should not
  // be re-added as prospects - they are already being actively worked.
  const ACTIVE_STAGES = [
    "outreach",
    "conversation",
    "pitched",
    "negotiating",
    "committed",
    "fulfilling",
    "renewed",
  ] as const;

  const busyDealRows = await db
    .select({ companyId: deals.companyId })
    .from(deals)
    .where(inArray(deals.stage, [...ACTIVE_STAGES]));
  const busyCompanyIds = new Set(busyDealRows.map((r) => r.companyId));

  console.log(
    `${busyCompanyIds.size} companies already in active pipeline - skipping.`,
  );

  // Load all eligible companies
  const allCompanies = await db.select().from(companies);
  const eligible = allCompanies.filter((c) => !busyCompanyIds.has(c.id));
  console.log(`${eligible.length} companies eligible for prospect pool.`);

  // Tier lookup for tier-value bonus
  const allTiers = await db.select().from(tiers);
  const tierById = new Map(allTiers.map((t) => [t.id, t]));
  const anchorTier = Array.from(tierById.values())
    .filter((t) => t.active)
    .reduce<(typeof tierById extends Map<number, infer V> ? V : never) | null>(
      (top, t) => (top == null || t.price > top.price ? t : top),
      null,
    );
  const anchorPrice = anchorTier?.price ?? null;

  // Signal fit scores
  const SIGNAL_WEIGHTS: Record<string, number> = {
    hires_gt_interns: 3,
    sponsors_peer_orgs: 2,
    has_ur_budget: 2,
    warm_path: 3,
    asian_erg: 1,
    prior_org_contact: 2,
  };
  const TOTAL_WEIGHT = Object.values(SIGNAL_WEIGHTS).reduce((s, w) => s + w, 0); // 13

  const allSignals = await db.select().from(companySignals);
  const signalsByCompany = new Map<
    number,
    { signalKey: string; checked: boolean }[]
  >();
  for (const s of allSignals) {
    if (!signalsByCompany.has(s.companyId))
      signalsByCompany.set(s.companyId, []);
    signalsByCompany.get(s.companyId)!.push(s);
  }

  function fitScore(companyId: number): number {
    const sigs = signalsByCompany.get(companyId) ?? [];
    const earned = sigs
      .filter((s) => s.checked)
      .reduce((sum, s) => sum + (SIGNAL_WEIGHTS[s.signalKey] ?? 0), 0);
    return TOTAL_WEIGHT > 0 ? Math.round((earned / TOTAL_WEIGHT) * 100) : 0;
  }

  const PRIORITY_WEIGHT: Record<CompanyPriority, number> = {
    high: 100,
    medium: 50,
    low: 0,
  };
  const TIER_VALUE_WEIGHT = 40;

  function compositeRank(
    priority: string,
    fit: number,
    expectedTierPrice: number | null,
  ): number {
    const p =
      PRIORITY_WEIGHT[(priority as CompanyPriority) ?? "medium"] ?? 50;
    let tierBonus = 0;
    if (expectedTierPrice != null && anchorPrice && anchorPrice > 0) {
      const ratio = Math.min(1, expectedTierPrice / anchorPrice);
      tierBonus = Math.round(TIER_VALUE_WEIGHT * ratio);
    }
    return p + fit + tierBonus;
  }

  // Rank eligible companies
  type Ranked = {
    id: number;
    name: string;
    rank: number;
    fit: number;
  };

  const ranked: Ranked[] = eligible.map((c) => {
    const expectedTier =
      c.expectedTierId != null ? tierById.get(c.expectedTierId) ?? null : null;
    const fit = fitScore(c.id);
    const rank = compositeRank(c.priority, fit, expectedTier?.price ?? null);
    return { id: c.id, name: c.name, rank, fit };
  });

  ranked.sort(
    (a, b) => b.rank - a.rank || b.fit - a.fit || a.name.localeCompare(b.name),
  );

  const top50 = ranked.slice(0, 50);

  console.log("\nTop 50 companies to add as prospects:");
  top50.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.name} (rank=${c.rank}, fit=${c.fit})`),
  );

  // ---------------------------------------------------------------------------
  // 4. Create prospect deals for top 50
  // ---------------------------------------------------------------------------

  const now = new Date().toISOString();

  for (const company of top50) {
    await db.insert(deals).values({
      companyId: company.id,
      cycle: CYCLE,
      stage: "prospect",
      stageEnteredAt: now,
      createdAt: now,
    });
  }

  console.log(
    `\nDone. Created ${top50.length} prospect deals in cycle ${CYCLE}.`,
  );
}

main();
