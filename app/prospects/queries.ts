import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/schema";
import { logAudit } from "@/lib/data";
import { normalizeCompanyName, normalizeHost } from "./dedupe";

/**
 * Set a company's fit-notes free text. The shared data layer's UpdateCompanyInput
 * does not expose fit_notes yet, so this feature updates the column directly.
 */
export async function setCompanyFitNotes(
  companyId: number,
  fitNotes: string | null,
  actorUserId: number | null = null,
): Promise<void> {
  const row = await db
    .update(companies)
    .set({ fitNotes })
    .where(eq(companies.id, companyId))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "companies", row.id, "update", row);
}

/**
 * Existing companies indexed for import de-duplication: by bare website host and
 * by normalized name (Inc/Corp/LLC stripped). Each key maps to the display name
 * of the first matching company, so the preview can say "duplicate of X".
 */
export interface DedupeIndex {
  byHost: Map<string, string>;
  byNormalizedName: Map<string, string>;
}

export async function existingCompanyDedupeIndex(): Promise<DedupeIndex> {
  const rows = await db
    .select({
      name: companies.name,
      website: companies.website,
      host: companies.host,
      normalizedName: companies.normalizedName,
    })
    .from(companies)
    .all();

  const byHost = new Map<string, string>();
  const byNormalizedName = new Map<string, string>();
  for (const r of rows) {
    const host = r.host ?? normalizeHost(r.website);
    if (host && !byHost.has(host)) byHost.set(host, r.name);
    const norm = r.normalizedName ?? normalizeCompanyName(r.name);
    if (norm && !byNormalizedName.has(norm)) byNormalizedName.set(norm, r.name);
  }
  return { byHost, byNormalizedName };
}
