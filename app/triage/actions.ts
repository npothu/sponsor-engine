"use server";

import { revalidatePath } from "next/cache";
import {
  ingestContactInbox,
  keepAndMessageInboxContact,
  keepInboxContact,
  rejectInboxContact,
  reopenInboxContact,
  undoTriageLinkedinTouch,
  updateTriageLinkedinTouch,
} from "@/lib/data";
import { parseScrapePayload } from "@/lib/contact-inbox";
import { currentUserId } from "@/lib/auth-context";

/**
 * Server actions for the contact-triage feature: paste-ingest a scrape, then
 * keep/reject each pending row. Decisions revalidate the triage view; keeps
 * also revalidate the pipeline views a new contact/company can appear on.
 */

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface IngestScrapeResult {
  /** rows newly staged as pending */
  added: number;
  /** rows skipped because they were already in the inbox (any status) */
  duplicates: number;
  /** people successfully parsed out of the paste */
  parsed: number;
  /** entries in the paste that were not parseable people */
  malformed: number;
  error: string | null;
}

/** Parse pasted scrape JSON and stage its people as pending inbox rows. */
export async function ingestScrapeAction(
  formData: FormData,
): Promise<IngestScrapeResult> {
  const parsed = parseScrapePayload(str(formData.get("payload")));
  if (!parsed) {
    return {
      added: 0,
      duplicates: 0,
      parsed: 0,
      malformed: 0,
      error:
        "Could not read that as scrape JSON. Paste the extension's Copy JSON output (or the downloaded .json file's contents).",
    };
  }
  const actorUserId = await currentUserId();
  const { added, duplicates } = await ingestContactInbox(
    parsed.people,
    { source: "apollo", scrapedAt: parsed.scrapedAt },
    actorUserId,
  );
  revalidatePath("/triage");
  return {
    added,
    duplicates,
    parsed: parsed.people.length,
    malformed: parsed.skipped,
    error: null,
  };
}

export interface DecisionResult {
  ok: boolean;
  /** human summary for the feedback line, e.g. where a kept contact went */
  summary: string;
}

/** Keep a pending row: create the contact, matching or creating its company. */
export async function keepContactAction(
  formData: FormData,
): Promise<DecisionResult> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return { ok: false, summary: "Invalid row." };
  const actorUserId = await currentUserId();
  const result = await keepInboxContact(inboxId, actorUserId);
  if (!result) {
    return {
      ok: false,
      summary: "Could not keep - row already decided or has no company name.",
    };
  }
  revalidatePath("/triage");
  revalidatePath("/companies");
  if (result.createdCompany) {
    revalidatePath("/prospects");
    revalidatePath("/board");
  }
  const suffix = result.createdCompany
    ? " (new company + prospect deal)"
    : result.reusedContact
      ? " (matched an existing contact)"
      : "";
  return {
    ok: true,
    summary: `Kept ${result.row.name} → ${result.companyName}${suffix}`,
  };
}

/**
 * Keep a pending row AND log that a LinkedIn DM was just sent: contact
 * created, outbound linkedin touchpoint logged, LinkedIn cadence assigned
 * when the deal had none, stage nudged to outreach (never regressed).
 */
export async function keepAndMessageContactAction(
  formData: FormData,
): Promise<DecisionResult> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return { ok: false, summary: "Invalid row." };
  const actorUserId = await currentUserId();
  const touchType =
    str(formData.get("touchType")) === "connection_request"
      ? "connection_request"
      : "dm";
  const result = await keepAndMessageInboxContact(inboxId, actorUserId, {
    touchType,
    note: str(formData.get("note")) || null,
  });
  if (!result) {
    return {
      ok: false,
      summary: "Could not keep - row already decided or has no company name.",
    };
  }
  revalidatePath("/triage");
  revalidatePath("/companies");
  revalidatePath("/prospects");
  revalidatePath("/board");
  revalidatePath("/");
  const followUp = result.followUpDue
    ? ` - follow-up due ${formatFollowUp(result.followUpDue)}`
    : "";
  return {
    ok: true,
    summary: `Kept ${result.row.name} → ${result.companyName} - ${
      touchType === "connection_request"
        ? "connection request"
        : "DM"
    } logged${followUp}`,
  };
}

/** Format a YYYY-MM-DD due date as e.g. "Aug 1" for the triage feedback line. */
function formatFollowUp(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Correct the LinkedIn touch type or optional note from decided history. */
export async function updateTriageLinkedinTouchAction(
  formData: FormData,
): Promise<DecisionResult> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return { ok: false, summary: "Invalid row." };
  const touchType =
    str(formData.get("touchType")) === "connection_request"
      ? "connection_request"
      : "dm";
  const actorUserId = await currentUserId();
  const row = await updateTriageLinkedinTouch(
    inboxId,
    touchType,
    str(formData.get("note")) || null,
    actorUserId,
  );
  if (!row) {
    return { ok: false, summary: "That LinkedIn touch can no longer be edited." };
  }
  revalidatePath("/triage");
  revalidatePath(`/companies/${row.companyId}`);
  return { ok: true, summary: `Updated LinkedIn touch for ${row.name}.` };
}

/** Remove the triage-created LinkedIn touch while keeping the contact. */
export async function undoTriageLinkedinTouchAction(
  formData: FormData,
): Promise<DecisionResult> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return { ok: false, summary: "Invalid row." };
  const actorUserId = await currentUserId();
  const row = await undoTriageLinkedinTouch(inboxId, actorUserId);
  if (!row) {
    return { ok: false, summary: "That LinkedIn touch can no longer be undone." };
  }
  revalidatePath("/triage");
  revalidatePath(`/companies/${row.companyId}`);
  revalidatePath("/prospects");
  revalidatePath("/board");
  revalidatePath("/");
  return {
    ok: true,
    summary: `Removed the LinkedIn touch for ${row.name}; contact remains kept.`,
  };
}

/** Reject a pending row with a structured reason. */
export async function rejectContactAction(
  formData: FormData,
): Promise<DecisionResult> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return { ok: false, summary: "Invalid row." };
  const actorUserId = await currentUserId();
  const row = await rejectInboxContact(
    inboxId,
    str(formData.get("reason")),
    actorUserId,
  );
  if (!row) return { ok: false, summary: "Row already decided." };
  revalidatePath("/triage");
  return { ok: true, summary: `Rejected ${row.name} (${row.rejectReason})` };
}

/** Undo a rejection, sending the row back to pending. */
export async function reopenContactAction(
  formData: FormData,
): Promise<DecisionResult> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return { ok: false, summary: "Invalid row." };
  const actorUserId = await currentUserId();
  const row = await reopenInboxContact(inboxId, actorUserId);
  if (!row) return { ok: false, summary: "Only rejected rows can be reopened." };
  revalidatePath("/triage");
  return { ok: true, summary: `Reopened ${row.name}` };
}
