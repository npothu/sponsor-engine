import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deals, companies } from "@/lib/schema";
import type { DealStage } from "@/lib/schema";

/**
 * Fixed catalog of prospect sources. `key` is persisted on companies.source;
 * `label` is the human-readable name shown in selects and badges.
 */
export interface SourceDef {
  key: string;
  label: string;
}

export const SOURCE_CATALOG: readonly SourceDef[] = [
  { key: "hackathon_sponsor", label: "Hackathon sponsor" },
  { key: "peer_org_sponsor", label: "Peer-org sponsor" },
  { key: "career_fair", label: "Career fair" },
  { key: "national_org", label: "National org" },
  { key: "alumni_employer", label: "Alumni employer" },
  { key: "member_referral", label: "Member referral" },
  { key: "cold_research", label: "Cold research" },
  { key: "other", label: "Other" },
] as const;

const SOURCE_LABEL = new Map(SOURCE_CATALOG.map((s) => [s.key, s.label]));

/** Human label for a source key; falls back to the raw key when unknown. */
export function sourceLabel(key: string | null | undefined): string {
  if (!key) return "No source";
  return SOURCE_LABEL.get(key) ?? key;
}

/** Stages that count as "advanced beyond outreach" for the conversion signal. */
const ADVANCED_STAGES: readonly DealStage[] = [
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
] as const;

/** One row of the source-performance strip. */
export interface SourcePerformance {
  key: string;
  label: string;
  /** total companies attributed to this source */
  total: number;
  /**
   * companies with at least one deal that ever reached a stage beyond outreach.
   * A simple conversion signal per acquisition channel.
   */
  advanced: number;
}

/**
 * Per-source performance: how many companies from each source have a deal that
 * ever advanced past outreach. This is a coarse conversion signal, not a
 * per-cycle metric - a company counts as "advanced" if any of its deals reached
 * conversation or later. Only sources that have at least one company appear.
 */
export async function listSourcePerformance(): Promise<SourcePerformance[]> {
  const totals = await db
    .select({
      source: companies.source,
      total: sql<number>`count(*)`.as("total"),
    })
    .from(companies)
    .groupBy(companies.source)
    .all();

  // Company ids that have any deal in an advanced stage.
  const advancedCompanyIdRows = await db
    .selectDistinct({ companyId: deals.companyId })
    .from(deals)
    .where(inArray(deals.stage, ADVANCED_STAGES as DealStage[]))
    .all();
  const advancedCompanyIds = new Set(
    advancedCompanyIdRows.map((r) => r.companyId),
  );

  const advancedBySource = await db
    .select({ id: companies.id, source: companies.source })
    .from(companies)
    .all();

  const advancedCounts = new Map<string, number>();
  for (const c of advancedBySource) {
    if (!advancedCompanyIds.has(c.id)) continue;
    const key = c.source ?? "";
    advancedCounts.set(key, (advancedCounts.get(key) ?? 0) + 1);
  }

  const totalBySource = new Map<string, number>();
  for (const t of totals) {
    totalBySource.set(t.source ?? "", t.total);
  }

  const rows: SourcePerformance[] = [];
  for (const def of SOURCE_CATALOG) {
    const total = totalBySource.get(def.key) ?? 0;
    if (total === 0) continue;
    rows.push({
      key: def.key,
      label: def.label,
      total,
      advanced: advancedCounts.get(def.key) ?? 0,
    });
  }
  return rows;
}
