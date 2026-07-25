import type { Client } from "@libsql/client";
import type { ContactCategory, EmailStatus } from "./schema";

/** Row shape read from contacts during v9 data backfill. */
export interface ContactBackfillRow {
  id: number;
  name: string;
  role: string | null;
  email: string | null;
  contactType: string | null;
  sourcedFrom: string | null;
  notes: string | null;
}

/**
 * Matches text that marks a contact as an alum of your school. Edit this for
 * your own institution - add the school name and whatever shorthand your
 * contacts actually use (initials, degree codes, class years).
 */
export const ALUMNI_PATTERN = /\balum(?:ni|nus|na)?\b|\bclass of '?\d{2}/;

/**
 * Infer a sourcing category from legacy contact fields. Returns null when
 * nothing can be inferred confidently - never guess.
 */
export function inferContactCategory(row: ContactBackfillRow): ContactCategory | null {
  const nameLower = row.name.toLowerCase();
  const roleLower = (row.role ?? "").toLowerCase();
  const sourcedLower = (row.sourcedFrom ?? "").toLowerCase();
  const notesLower = (row.notes ?? "").toLowerCase();
  const combined = `${nameLower} ${roleLower} ${sourcedLower} ${notesLower}`;

  if (
    nameLower.includes("(group)") ||
    roleLower.includes("portal") ||
    roleLower.includes("employee resource group")
  ) {
    return "channel_fallback";
  }

  if (
    sourcedLower.includes("university-relations") ||
    sourcedLower.includes("university relations") ||
    /campus|university recruit|early career|early careers|students & grads|university relations/.test(
      roleLower,
    )
  ) {
    return "university_relations";
  }

  if (/erg|brg|employee resource|pan-asian|api network|asian network/.test(combined)) {
    if (/chair|president|lead|officer|co-chair|co chair|sponsor|executive/.test(combined)) {
      return "erg_lead";
    }
    return "erg_officer";
  }

  if (ALUMNI_PATTERN.test(combined) || row.contactType === "champion") {
    return "alum_early_career";
  }

  if (row.contactType === "gatekeeper") return "university_relations";
  if (row.contactType === "influencer") return "erg_lead";
  if (row.contactType === "budget_holder") return "channel_fallback";

  return null;
}

/**
 * Infer email trust level when an address exists but email_status was never set.
 * Person emails stay null (unknown provenance); only role inboxes get tagged.
 */
export function inferEmailStatus(row: ContactBackfillRow): EmailStatus | null {
  if (!row.email?.trim()) return null;

  const nameLower = row.name.toLowerCase();
  const roleLower = (row.role ?? "").toLowerCase();

  if (
    nameLower.includes("(group)") ||
    /portal|inbox|recruiting team|candidate care|careers team|early careers/.test(
      roleLower,
    )
  ) {
    return "role_inbox";
  }

  return null;
}

/**
 * Idempotent v9 data backfill: populate contacts.category and contacts.email_status
 * for legacy rows. Runs on every migrate() once v9 columns exist. Only fills nulls.
 */
export async function backfillV9ContactData(client: Client): Promise<void> {
  const cols = await client.execute("PRAGMA table_info(contacts)");
  const hasCategory = cols.rows.some(
    (c) => (c as unknown as { name: string }).name === "category",
  );
  if (!hasCategory) return;

  const rowsResult = await client.execute(
    `SELECT id, name, role, email, contact_type AS contactType,
            sourced_from AS sourcedFrom, notes
     FROM contacts
     WHERE category IS NULL
        OR (email IS NOT NULL AND email != '' AND email_status IS NULL)`,
  );
  const rows = rowsResult.rows as unknown as ContactBackfillRow[];

  for (const row of rows) {
    const category = inferContactCategory(row);
    if (category) {
      await client.execute({
        sql: "UPDATE contacts SET category = ? WHERE id = ? AND category IS NULL",
        args: [category, row.id],
      });
    }

    const emailStatus = inferEmailStatus(row);
    if (emailStatus) {
      await client.execute({
        sql: "UPDATE contacts SET email_status = ? WHERE id = ? AND email IS NOT NULL AND email != '' AND email_status IS NULL",
        args: [emailStatus, row.id],
      });
    }
  }
}
