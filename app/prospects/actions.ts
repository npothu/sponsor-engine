"use server";

import { revalidatePath } from "next/cache";
import {
  createCompany,
  createDeal,
  updateDealStage,
  bulkStartOutreach,
  setCompanySignal,
  setCompanyExpectedTier,
  getCurrentCycle,
  removeDeal,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";
import {
  setCompanyFitNotes,
  existingCompanyDedupeIndex,
  type DedupeIndex,
} from "./queries";
import { normalizeCompanyName, normalizeHost } from "./dedupe";
import { SOURCE_CATALOG } from "./sources";

/**
 * Server actions for the prospects feature. Every mutation revalidates the
 * prospects view (and the shared pipeline views where a deal changed).
 */

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function nullableStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}

function nullableId(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s.length) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SOURCE_KEYS = new Set(SOURCE_CATALOG.map((s) => s.key));

/** Coerce an arbitrary form value to a known source key, else null. */
function sourceKey(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s && SOURCE_KEYS.has(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Single-add intake
// ---------------------------------------------------------------------------

/**
 * Create one prospect: a company plus an opening deal in the current cycle at
 * prospect stage. Website/source/notes are optional.
 */
export async function addProspectAction(formData: FormData): Promise<void> {
  const name = str(formData.get("name"));
  if (!name) return;
  const actorUserId = await currentUserId();
  const company = await createCompany(
    {
      name,
      type: "corporate",
      website: nullableStr(formData.get("website")),
      source: sourceKey(formData.get("source")),
      notes: nullableStr(formData.get("notes")),
    },
    actorUserId,
  );
  await createDeal(
    {
      companyId: company.id,
      cycle: await getCurrentCycle(),
      stage: "prospect",
    },
    actorUserId,
  );

  revalidatePath("/prospects");
  revalidatePath("/companies");
  revalidatePath("/board");
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

/** One parsed line from the bulk-import textarea. */
export interface ParsedImportLine {
  name: string;
  website: string | null;
  /** true when the line matches an existing company or an earlier batch line */
  duplicate: boolean;
  /**
   * How it matched: "host" (same website domain), "name" (same normalized
   * name), or null when unique. `duplicateOf` names the company it collides
   * with, so the preview can say "possible duplicate of X".
   */
  matchKind: "host" | "name" | null;
  duplicateOf: string | null;
}

export interface ImportPreview {
  source: string | null;
  rows: ParsedImportLine[];
  addable: number;
  duplicates: number;
}

/**
 * Mutable running index of what we have already seen (existing companies plus
 * earlier batch lines), matched on bare host first then normalized name.
 * Returns the matching company name and how it matched, or a null match.
 */
function matchLine(
  index: DedupeIndex,
  name: string,
  website: string | null,
): { matchKind: "host" | "name" | null; duplicateOf: string | null } {
  const host = normalizeHost(website);
  if (host && index.byHost.has(host)) {
    return { matchKind: "host", duplicateOf: index.byHost.get(host) ?? null };
  }
  const norm = normalizeCompanyName(name);
  if (norm && index.byNormalizedName.has(norm)) {
    return {
      matchKind: "name",
      duplicateOf: index.byNormalizedName.get(norm) ?? null,
    };
  }
  return { matchKind: null, duplicateOf: null };
}

/** Record a just-accepted line into the running index so later lines collide with it. */
function rememberLine(
  index: DedupeIndex,
  name: string,
  website: string | null,
): void {
  const host = normalizeHost(website);
  if (host && !index.byHost.has(host)) index.byHost.set(host, name);
  const norm = normalizeCompanyName(name);
  if (norm && !index.byNormalizedName.has(norm))
    index.byNormalizedName.set(norm, name);
}

interface ParsedRaw {
  name: string;
  website: string | null;
}

/** Parse the "Name [| website]" textarea into name/website rows, dropping blanks. */
function parseLines(raw: string): ParsedRaw[] {
  const out: ParsedRaw[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [namePart, ...rest] = trimmed.split("|");
    const name = namePart.trim();
    if (!name) continue;
    out.push({ name, website: rest.join("|").trim() || null });
  }
  return out;
}

/**
 * Parse the textarea into rows, flagging duplicates against existing companies
 * AND earlier lines in the same batch. Matching is on bare website host first,
 * then normalized name (Inc/Corp/LLC stripped), so "Acme, Inc." collides with
 * an existing "Acme Corporation" and two lines with the same domain collide.
 */
export async function previewBulkImportAction(
  formData: FormData,
): Promise<ImportPreview> {
  const source = sourceKey(formData.get("source"));
  const raw = str(formData.get("bulk"));
  const index = await existingCompanyDedupeIndex();

  const rows: ParsedImportLine[] = [];
  for (const { name, website } of parseLines(raw)) {
    const { matchKind, duplicateOf } = matchLine(index, name, website);
    const duplicate = matchKind !== null;
    if (!duplicate) rememberLine(index, name, website);
    rows.push({ name, website, duplicate, matchKind, duplicateOf });
  }

  const duplicates = rows.filter((r) => r.duplicate).length;
  return {
    source,
    rows,
    addable: rows.length - duplicates,
    duplicates,
  };
}

export interface ImportResult {
  added: number;
  skipped: number;
}

/**
 * Commit a bulk import. Re-parses and re-checks duplicates at commit time (so a
 * company added between preview and commit is still skipped), matching on host
 * then normalized name, creating a company + prospect deal for each unique line.
 */
export async function commitBulkImportAction(
  formData: FormData,
): Promise<ImportResult> {
  const source = sourceKey(formData.get("source"));
  const raw = str(formData.get("bulk"));
  const index = await existingCompanyDedupeIndex();
  const cycle = await getCurrentCycle();
  const actorUserId = await currentUserId();

  let added = 0;
  let skipped = 0;

  for (const { name, website } of parseLines(raw)) {
    const { matchKind } = matchLine(index, name, website);
    if (matchKind !== null) {
      skipped += 1;
      continue;
    }
    const company = await createCompany(
      {
        name,
        type: "corporate",
        website,
        source,
      },
      actorUserId,
    );
    await createDeal(
      { companyId: company.id, cycle, stage: "prospect" },
      actorUserId,
    );
    rememberLine(index, name, website);
    added += 1;
  }

  if (added > 0) {
    revalidatePath("/prospects");
    revalidatePath("/companies");
    revalidatePath("/board");
  }
  return { added, skipped };
}

// ---------------------------------------------------------------------------
// Pool row inline mutations
// ---------------------------------------------------------------------------

/** Toggle a single fit signal on a company. */
export async function toggleSignalAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const key = str(formData.get("key"));
  const checked = str(formData.get("checked")) === "true";
  if (companyId == null || !key) return;
  const actorUserId = await currentUserId();
  await setCompanySignal(companyId, key, checked, undefined, actorUserId);
  revalidatePath("/prospects");
}

/** Save a company's fit-notes free text. */
export async function saveFitNotesAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  if (companyId == null) return;
  const actorUserId = await currentUserId();
  await setCompanyFitNotes(
    companyId,
    nullableStr(formData.get("fitNotes")),
    actorUserId,
  );
  revalidatePath("/prospects");
}

/** Tag (or clear, with an empty value) a prospect's expected/target tier. */
export async function setExpectedTierAction(
  formData: FormData,
): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  if (companyId == null) return;
  const actorUserId = await currentUserId();
  await setCompanyExpectedTier(
    companyId,
    nullableId(formData.get("tierId")),
    actorUserId,
  );
  revalidatePath("/prospects");
}

/** Advance a prospect's deal to the outreach stage. */
export async function startOutreachAction(formData: FormData): Promise<void> {
  const dealId = nullableId(formData.get("dealId"));
  if (dealId == null) return;
  const actorUserId = await currentUserId();
  await updateDealStage(dealId, "outreach", actorUserId);
  revalidatePath("/prospects");
  revalidatePath("/companies");
  revalidatePath("/board");
}

export interface BulkOutreachResult {
  advanced: number;
}

/** Remove a prospect-stage deal from the pool (deletes deal + its next_actions/stage_events). */
export async function removeProspectAction(formData: FormData): Promise<void> {
  const dealId = nullableId(formData.get("dealId"));
  if (dealId == null) return;
  const actorUserId = await currentUserId();
  await removeDeal(dealId, actorUserId);
  revalidatePath("/prospects");
  revalidatePath("/board");
}

/**
 * Advance a batch of selected prospect deals into outreach in one transaction,
 * optionally assigning a cadence to each. `dealIds` is a comma-separated list;
 * `cadenceId` is optional (blank = no cadence). Only prospect-stage deals move.
 */
export async function bulkStartOutreachAction(
  formData: FormData,
): Promise<BulkOutreachResult> {
  const dealIds = str(formData.get("dealIds"))
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (dealIds.length === 0) return { advanced: 0 };

  const cadenceId = nullableId(formData.get("cadenceId"));
  const actorUserId = await currentUserId();
  const advanced = await bulkStartOutreach(dealIds, cadenceId, actorUserId);

  if (advanced > 0) {
    revalidatePath("/prospects");
    revalidatePath("/companies");
    revalidatePath("/board");
  }
  return { advanced };
}
