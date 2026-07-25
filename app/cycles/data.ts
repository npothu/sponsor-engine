import "server-only";
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deals } from "@/lib/schema";

// previewRollover / RolloverPreview now live in the shared data layer (lib/data)
// so the preview and rolloverCycle execution share one selection core. Re-export
// them here so existing /cycles callers keep importing from "./data".
export { previewRollover } from "@/lib/data";
export type { RolloverPreview } from "@/lib/data";

/**
 * Small read helpers scoped to the /cycles feature. These live here (rather than
 * in lib/data) because the shared data layer does not expose per-cycle deal
 * counts or the distinct-cycle-labels list. They import drizzle directly,
 * mirroring the queries the shared layer already uses.
 */

/** Deal count keyed by cycle label, for the cycle list. */
export async function dealCountsByCycle(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      cycle: deals.cycle,
      count: sql<number>`count(*)`.as("deal_count"),
    })
    .from(deals)
    .groupBy(deals.cycle)
    .all();
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.cycle, r.count);
  return out;
}

/** Every distinct cycle label that appears on a deal (newest label first). */
export async function cycleLabelsFromDeals(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ cycle: deals.cycle })
    .from(deals)
    .orderBy(desc(deals.cycle))
    .all();
  return rows.map((r) => r.cycle);
}

