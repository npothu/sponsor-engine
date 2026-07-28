import "server-only";
import {
  companyIdsWithOutboundTouch,
  companyIdsWithRejectedDeals,
  contactCountByCompany,
  currentCycleDealStageByCompany,
  listCompanies,
  listContactInbox,
} from "@/lib/data";
import { suggestTriage, type TriageSuggestion } from "@/lib/contact-inbox";
import { normalizeCompanyName } from "@/app/prospects/dedupe";
import type { ContactInboxRow, DealStage } from "@/lib/schema";

/** Stages where a keep/DM might cross wires with an in-flight conversation. */
const IN_FLIGHT_STAGES: readonly DealStage[] = [
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
];

/** A pending inbox row annotated with everything the review card displays. */
export interface TriagePendingRow {
  row: ContactInboxRow;
  /** existing company matched on normalized name, or null (keep will create one) */
  companyMatch: { id: number; name: string } | null;
  /** the matched company has a rejected deal - keep adds the contact, no deal */
  companyRejected: boolean;
  /** contacts already on the matched company (0 for a company we'd create) */
  companyContactCount: number;
  /** the matched company has at least one outbound touchpoint logged */
  companyContacted: boolean;
  /** matched company's current-cycle deal is mid-conversation or later -
   *  warn before a DM crosses wires with an in-flight thread (nullable) */
  activeDealStage: DealStage | null;
  /** title-based keep/reject hint, or null when the title is undecidable */
  suggestion: TriageSuggestion | null;
}

export interface TriageData {
  pending: TriagePendingRow[];
  kept: ContactInboxRow[];
  rejected: ContactInboxRow[];
}

/** Load and annotate the whole triage view in one place. */
export async function loadTriageData(): Promise<TriageData> {
  const [
    rows,
    allCompanies,
    rejectedCompanyIds,
    dealStageByCompany,
    contactCounts,
    contactedCompanyIds,
  ] = await Promise.all([
    listContactInbox(),
    listCompanies(),
    companyIdsWithRejectedDeals(),
    currentCycleDealStageByCompany(),
    contactCountByCompany(),
    companyIdsWithOutboundTouch(),
  ]);

  const byNormalizedName = new Map<string, { id: number; name: string }>();
  for (const c of allCompanies) {
    const key = c.normalizedName ?? normalizeCompanyName(c.name);
    if (key && !byNormalizedName.has(key)) {
      byNormalizedName.set(key, { id: c.id, name: c.name });
    }
  }

  const pending: TriagePendingRow[] = [];
  const kept: ContactInboxRow[] = [];
  const rejected: ContactInboxRow[] = [];
  for (const row of rows) {
    if (row.status === "kept") {
      kept.push(row);
      continue;
    }
    if (row.status === "rejected") {
      rejected.push(row);
      continue;
    }
    const companyMatch = row.companyName
      ? (byNormalizedName.get(normalizeCompanyName(row.companyName)) ?? null)
      : null;
    const stage = companyMatch
      ? (dealStageByCompany.get(companyMatch.id) ?? null)
      : null;
    pending.push({
      row,
      companyMatch,
      companyRejected:
        companyMatch != null && rejectedCompanyIds.has(companyMatch.id),
      // A company we have not created yet trivially has no contacts and no
      // outreach, so an unmatched row reads as 0 / false.
      companyContactCount: companyMatch
        ? (contactCounts.get(companyMatch.id) ?? 0)
        : 0,
      companyContacted:
        companyMatch != null && contactedCompanyIds.has(companyMatch.id),
      activeDealStage:
        stage && IN_FLIGHT_STAGES.includes(stage) ? stage : null,
      suggestion: suggestTriage(row.title),
    });
  }

  const byDecidedDesc = (a: ContactInboxRow, b: ContactInboxRow) =>
    (b.decidedAt ?? "") < (a.decidedAt ?? "") ? -1 : 1;
  kept.sort(byDecidedDesc);
  rejected.sort(byDecidedDesc);

  return { pending, kept, rejected };
}
