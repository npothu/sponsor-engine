import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tiers } from "@/lib/schema";
import {
  ACTIVE_STAGES,
  getCurrentCycle,
  getSetting,
  listDealsWithCompany,
} from "@/lib/data";

export interface DashboardStats {
  cycle: string | null;
  activeDealsCount: number;
  committedDollars: number;
  /** committed+ deals in the cycle targeting the anchor (top-priced active) tier */
  anchorSponsorCount: number;
  /** the anchor tier's display name, for the stat label (null when no active tiers) */
  anchorTierName: string | null;
  /** the anchor_target setting as a number (0 when unset) */
  anchorTarget: number;
}

/**
 * "Committed dollars this cycle": sum of askAmount across deals in the
 * current cycle that have progressed past negotiating (committed, fulfilling,
 * renewed) - i.e. dollars you can actually count on.
 */
const COMMITTED_STAGES = ["committed", "fulfilling", "renewed"];

export async function getDashboardStats(): Promise<DashboardStats> {
  const allDeals = await listDealsWithCompany();
  const cycle = allDeals.length ? await getCurrentCycle() : null;
  const cycleDeals = cycle ? allDeals.filter((d) => d.cycle === cycle) : allDeals;

  const activeDealsCount = cycleDeals.filter((d) =>
    (ACTIVE_STAGES as readonly string[]).includes(d.stage),
  ).length;

  const committedDollars = cycleDeals
    .filter((d) => COMMITTED_STAGES.includes(d.stage))
    .reduce((sum, d) => sum + (d.askAmount ?? 0), 0);

  // The anchor tier is the top-priced ACTIVE tier (mirrors revenueSummary),
  // not a tier hardcoded by the name "Gold". The target comes from settings.
  const anchorTier = await db
    .select()
    .from(tiers)
    .where(eq(tiers.active, true))
    .orderBy(desc(tiers.price))
    .get();

  const anchorSponsorCount = anchorTier
    ? cycleDeals.filter(
        (d) =>
          d.targetTierId === anchorTier.id &&
          COMMITTED_STAGES.includes(d.stage),
      ).length
    : 0;

  const anchorTarget = Number((await getSetting("anchor_target")) ?? "0") || 0;

  return {
    cycle,
    activeDealsCount,
    committedDollars,
    anchorSponsorCount,
    anchorTierName: anchorTier?.name ?? null,
    anchorTarget,
  };
}
