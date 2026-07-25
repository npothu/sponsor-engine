"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCompany,
  updateCompany,
  createDeal,
  updateDeal,
  updateDealStage,
  createContact,
  updateContact,
  deleteContact,
  logTouchpoint,
  logReplyForDeal,
  createNextAction,
  completeNextAction,
  snoozeNextAction,
  setDealAddons,
  setCompanyReAsk,
  composeMessage,
  buildSponsorProposal,
  recycleLapsedDeal,
  CURRENT_CYCLE,
  normalizeContactCategory,
  normalizeEmailStatus,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";
import { gmailComposeUrl, mailtoUrl } from "@/lib/compose";
import type {
  CompanyPriority,
  CompanyType,
  ContactType,
  ContactWarmth,
  DealLostReason,
  DealSatisfaction,
  DealStage,
  TouchpointChannel,
  TouchpointDirection,
} from "@/lib/data";

/**
 * Server actions for the companies feature. Every mutation revalidates the
 * affected paths so RSC data stays fresh.
 */

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function nullableStr(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s.length ? s : null;
}

function nullableNum(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s.length) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function nullableId(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s.length) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Company + its opening deal
// ---------------------------------------------------------------------------

export async function createCompanyAction(formData: FormData): Promise<void> {
  const name = str(formData.get("name"));
  if (!name) return;
  const actorUserId = await currentUserId();
  const company = await createCompany(
    {
      name,
      type: (str(formData.get("type")) as CompanyType) || "corporate",
      priority: (str(formData.get("priority")) as CompanyPriority) || "medium",
      website: nullableStr(formData.get("website")),
      source: nullableStr(formData.get("source")),
      notes: nullableStr(formData.get("notes")),
    },
    actorUserId,
  );
  // Every new company starts a deal in the current cycle at prospect stage.
  await createDeal(
    { companyId: company.id, cycle: CURRENT_CYCLE, stage: "prospect" },
    actorUserId,
  );

  revalidatePath("/companies");
  revalidatePath("/board");
  redirect(`/companies/${company.id}`);
}

export async function updateCompanyDetailsAction(
  formData: FormData,
): Promise<void> {
  const id = nullableId(formData.get("companyId"));
  if (id == null) return;
  const reAskOn = nullableStr(formData.get("reAskOn"));
  const actorUserId = await currentUserId();
  await updateCompany(
    id,
    {
      name: str(formData.get("name")) || undefined,
      type: (str(formData.get("type")) as CompanyType) || undefined,
      priority: (str(formData.get("priority")) as CompanyPriority) || undefined,
      website: nullableStr(formData.get("website")),
      source: nullableStr(formData.get("source")),
      reAskOn,
      // clear the reason whenever the date is cleared, so they never drift apart
      reAskReason: reAskOn ? nullableStr(formData.get("reAskReason")) : null,
      fiscalYearEnd: nullableStr(formData.get("fiscalYearEnd")),
    },
    actorUserId,
  );
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
  revalidatePath("/");
}

export async function updateCompanyNotesAction(
  formData: FormData,
): Promise<void> {
  const id = nullableId(formData.get("companyId"));
  if (id == null) return;
  const actorUserId = await currentUserId();
  await updateCompany(id, { notes: nullableStr(formData.get("notes")) }, actorUserId);
  revalidatePath(`/companies/${id}`);
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export async function createDealAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  if (companyId == null) return;
  const cycle = str(formData.get("cycle")) || CURRENT_CYCLE;
  const actorUserId = await currentUserId();
  await createDeal(
    {
      companyId,
      cycle,
      stage: (str(formData.get("stage")) as DealStage) || "prospect",
    },
    actorUserId,
  );
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/board");
}

export async function updateDealStageAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const dealId = nullableId(formData.get("dealId"));
  const stage = str(formData.get("stage")) as DealStage;
  if (dealId == null || !stage) return;
  const actorUserId = await currentUserId();
  await updateDealStage(dealId, stage, actorUserId);
  // When a deal lapses, capture the structured loss reason if one was provided
  // inline, so the successor board re-approaches with context next cycle.
  if (stage === "lapsed") {
    const lostReason =
      (str(formData.get("lostReason")) as DealLostReason) || null;
    if (lostReason) await updateDeal(dealId, { lostReason }, actorUserId);
    // A timing/budget loss is a deferral, not a dead end: arm a dated re-ask so
    // the company auto-resurfaces on Today when the window reopens.
    if (
      companyId != null &&
      (lostReason === "timing" || lostReason === "budget")
    ) {
      const reAskOn = str(formData.get("reAskOn")) || null;
      if (reAskOn) {
        const reason =
          nullableStr(formData.get("reAskReason")) ??
          `Lapsed on ${lostReason} - re-approach when the window reopens`;
        await setCompanyReAsk(companyId, reAskOn, reason, actorUserId);
      }
    }
  }
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/board");
  revalidatePath("/");
}

export async function updateDealTermsAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const dealId = nullableId(formData.get("dealId"));
  if (dealId == null) return;
  const actorUserId = await currentUserId();
  await updateDeal(
    dealId,
    {
      cycle: str(formData.get("cycle")) || undefined,
      askAmount: nullableNum(formData.get("askAmount")),
      targetTierId: nullableId(formData.get("targetTierId")),
      customTerms: nullableStr(formData.get("customTerms")),
      championContactId: formData.has("championContactId")
        ? nullableId(formData.get("championContactId"))
        : undefined,
    },
    actorUserId,
  );
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/board");
}

export async function setDealAddonsAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const dealId = nullableId(formData.get("dealId"));
  if (dealId == null) return;
  const addonIds = formData
    .getAll("addonId")
    .map((v) => Number(str(v)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const actorUserId = await currentUserId();
  await setDealAddons(dealId, addonIds, actorUserId);
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
}

/**
 * Build the sponsor-facing proposal one-pager Markdown for a deal. Returns an
 * empty string when the deal cannot be resolved, so the client can no-op safely.
 */
export async function buildProposalAction(dealId: number): Promise<string> {
  return (await buildSponsorProposal(dealId)) ?? "";
}

/**
 * Recycle a lapsed deal into the active cycle: clone its context into a fresh
 * prospect deal with a re-approach action. No-op when the deal is not lapsed or
 * the company already has an active-cycle deal (the data layer guards both).
 */
export async function recycleDealAction(
  companyId: number,
  dealId: number,
): Promise<void> {
  const actorUserId = await currentUserId();
  await recycleLapsedDeal(dealId, undefined, actorUserId);
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/board");
  revalidatePath("/");
}

/**
 * Set (or clear) the sponsor-satisfaction signal on a deal. An empty/invalid
 * value clears it; the data layer's normalizeDealSatisfaction guards the enum.
 */
export async function setDealSatisfactionAction(
  companyId: number,
  dealId: number,
  satisfaction: string,
): Promise<void> {
  const actorUserId = await currentUserId();
  await updateDeal(
    dealId,
    {
      satisfaction: (satisfaction as DealSatisfaction) || null,
    },
    actorUserId,
  );
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/fulfillment");
  revalidatePath("/cycles");
}

// ---------------------------------------------------------------------------
// One-click compose
// ---------------------------------------------------------------------------

export interface ComposeResult {
  ok: boolean;
  /** Gmail web compose deep link (prefilled) */
  gmailUrl: string;
  /** mailto: fallback for copy-to-clipboard */
  mailtoUrl: string;
  subject: string;
  body: string;
  /** recipient email, or null when the chosen contact has none on file */
  to: string | null;
}

/**
 * Render a template for a company (+ optional contact and deal) and return both
 * a prefilled Gmail compose deep link and a mailto: fallback. The client opens
 * the Gmail link in a new tab and offers copy-to-clipboard for the mailto.
 */
export async function composeEmailAction(
  formData: FormData,
): Promise<ComposeResult | null> {
  const templateId = nullableId(formData.get("templateId"));
  const companyId = nullableId(formData.get("companyId"));
  const contactId = nullableId(formData.get("contactId"));
  const dealId = nullableId(formData.get("dealId"));
  if (templateId == null || companyId == null) return null;

  const message = await composeMessage(
    templateId,
    companyId,
    contactId ?? undefined,
    dealId ?? undefined,
  );
  if (!message) return null;

  return {
    ok: true,
    gmailUrl: gmailComposeUrl(message),
    mailtoUrl: mailtoUrl(message),
    subject: message.subject,
    body: message.body,
    to: message.to,
  };
}

/**
 * "Got a reply" on a deal: log an inbound touchpoint (which detaches the
 * cadence) and, when requested, advance the deal to the conversation stage.
 */
export async function gotReplyAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const dealId = nullableId(formData.get("dealId"));
  const advance = str(formData.get("advance")) === "true";
  if (dealId == null) return;
  const actorUserId = await currentUserId();
  await logReplyForDeal(dealId, { advanceToConversation: advance }, actorUserId);
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/board");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function createContactAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const name = str(formData.get("name"));
  if (companyId == null || !name) return;
  const actorUserId = await currentUserId();
  await createContact(
    {
      companyId,
      name,
      role: nullableStr(formData.get("role")),
      email: nullableStr(formData.get("email")),
      phone: nullableStr(formData.get("phone")),
      linkedin: nullableStr(formData.get("linkedin")),
      sourcedFrom: nullableStr(formData.get("sourcedFrom")),
      warmth: (str(formData.get("warmth")) as ContactWarmth) || "cold",
      contactType: (str(formData.get("contactType")) as ContactType) || "unknown",
      referredByContactId: nullableId(formData.get("referredByContactId")),
      category: normalizeContactCategory(nullableStr(formData.get("category"))),
      emailStatus: normalizeEmailStatus(nullableStr(formData.get("emailStatus"))),
      emailSource: nullableStr(formData.get("emailSource")),
    },
    actorUserId,
  );
  revalidatePath(`/companies/${companyId}`);
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const contactId = nullableId(formData.get("contactId"));
  if (contactId == null) return;
  const actorUserId = await currentUserId();
  await updateContact(
    contactId,
    {
      name: str(formData.get("name")) || undefined,
      role: nullableStr(formData.get("role")),
      email: nullableStr(formData.get("email")),
      phone: nullableStr(formData.get("phone")),
      linkedin: nullableStr(formData.get("linkedin")),
      sourcedFrom: nullableStr(formData.get("sourcedFrom")),
      warmth: (str(formData.get("warmth")) as ContactWarmth) || undefined,
      contactType:
        (str(formData.get("contactType")) as ContactType) || undefined,
      // Only touch the referral when the select was present (a company with a
      // single contact never renders it, so we leave the existing value alone).
      referredByContactId: formData.has("referredByContactId")
        ? nullableId(formData.get("referredByContactId"))
        : undefined,
      category: formData.has("category")
        ? normalizeContactCategory(nullableStr(formData.get("category")))
        : undefined,
      emailStatus: formData.has("emailStatus")
        ? normalizeEmailStatus(nullableStr(formData.get("emailStatus")))
        : undefined,
      emailSource: formData.has("emailSource")
        ? nullableStr(formData.get("emailSource"))
        : undefined,
    },
    actorUserId,
  );
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const contactId = nullableId(formData.get("contactId"));
  if (contactId == null) return;
  const actorUserId = await currentUserId();
  await deleteContact(contactId, actorUserId);
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
}

// ---------------------------------------------------------------------------
// Touchpoints
// ---------------------------------------------------------------------------

export async function logTouchpointAction(formData: FormData): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  if (companyId == null) return;
  const occurred = str(formData.get("occurredAt"));
  const actorUserId = await currentUserId();
  await logTouchpoint(
    {
      companyId,
      dealId: nullableId(formData.get("dealId")),
      contactId: nullableId(formData.get("contactId")),
      channel: (str(formData.get("channel")) as TouchpointChannel) || "email",
      direction:
        (str(formData.get("direction")) as TouchpointDirection) || "outbound",
      occurredAt: occurred ? new Date(occurred).toISOString() : undefined,
      summary: nullableStr(formData.get("summary")),
      outcome: nullableStr(formData.get("outcome")),
      deckVersionId: nullableId(formData.get("deckVersionId")),
    },
    actorUserId,
  );
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/board");
}

// ---------------------------------------------------------------------------
// Next actions
// ---------------------------------------------------------------------------

export async function createNextActionAction(
  formData: FormData,
): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const dealId = nullableId(formData.get("dealId"));
  const title = str(formData.get("title"));
  const dueDate = str(formData.get("dueDate"));
  if (dealId == null || !title || !dueDate) return;
  const owner = nullableStr(formData.get("owner"));
  const actorUserId = await currentUserId();
  await createNextAction(
    { dealId, title, dueDate, owner, createdBy: "manual" },
    actorUserId,
  );
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

export async function completeNextActionAction(
  formData: FormData,
): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const actionId = nullableId(formData.get("actionId"));
  if (actionId == null) return;
  const actorUserId = await currentUserId();
  await completeNextAction(actionId, actorUserId);
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}

export async function snoozeNextActionAction(
  formData: FormData,
): Promise<void> {
  const companyId = nullableId(formData.get("companyId"));
  const actionId = nullableId(formData.get("actionId"));
  const days = Number(str(formData.get("days"))) || 3;
  if (actionId == null) return;
  const actorUserId = await currentUserId();
  await snoozeNextAction(actionId, days, actorUserId);
  if (companyId != null) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
}
