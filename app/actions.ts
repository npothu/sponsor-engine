"use server";

import { revalidatePath } from "next/cache";
import {
  completeNextAction,
  createNextAction,
  snoozeNextAction,
  composeForAction,
  logSentForAction,
  logReplyForDeal,
  reEngageDeal,
  reEngageHighPriorityStalled,
  updateDealStage,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";
import { gmailComposeUrl, mailtoUrl } from "@/lib/compose";

export async function completeActionAction(id: number) {
  const actorUserId = await currentUserId();
  await completeNextAction(id, actorUserId);
  revalidatePath("/");
}

export async function snoozeActionAction(id: number, days: number) {
  const actorUserId = await currentUserId();
  await snoozeNextAction(id, days, actorUserId);
  revalidatePath("/");
}

export interface ActionComposeResult {
  gmailUrl: string;
  mailtoUrl: string;
  subject: string;
  body: string;
  to: string | null;
}

/**
 * Render the cadence-step template behind a due action into a prefilled Gmail
 * compose link (plus a mailto: fallback). Returns null when the action has no
 * template to render, so the client can hide the compose button.
 */
export async function composeForActionAction(
  actionId: number,
): Promise<ActionComposeResult | null> {
  const message = await composeForAction(actionId);
  if (!message) return null;
  return {
    gmailUrl: gmailComposeUrl(message),
    mailtoUrl: mailtoUrl(message),
    subject: message.subject,
    body: message.body,
    to: message.to,
  };
}

/**
 * One submit that logs the outbound touchpoint for a due action, completes the
 * action, and lets the cadence engine schedule the next step (or arms the
 * stage-based default for manual actions). Revalidates Today plus the shared
 * pipeline views.
 */
export async function logSentForActionAction(actionId: number) {
  const actorUserId = await currentUserId();
  await logSentForAction(actionId, undefined, actorUserId);
  revalidatePath("/");
  revalidatePath("/companies");
  revalidatePath("/board");
}

/**
 * "Got a reply" from a Today row: log an inbound touchpoint on the deal (which
 * detaches the cadence) and advance it to the conversation stage.
 */
export async function gotReplyForDealAction(dealId: number) {
  const actorUserId = await currentUserId();
  await logReplyForDeal(dealId, { advanceToConversation: true }, actorUserId);
  revalidatePath("/");
  revalidatePath("/companies");
  revalidatePath("/board");
}

/**
 * Re-engage one stalled deal: ensure it has a dated next action and re-arm the
 * default cadence when it has none. Never wipes an existing open action.
 */
export async function reEngageDealAction(dealId: number) {
  const actorUserId = await currentUserId();
  await reEngageDeal(dealId, undefined, actorUserId);
  revalidatePath("/");
  revalidatePath("/companies");
  revalidatePath("/board");
}

/** Re-engage every high-priority stalled deal in one click. */
export async function reEngageHighPriorityStalledAction() {
  const actorUserId = await currentUserId();
  const count = await reEngageHighPriorityStalled(actorUserId);
  revalidatePath("/");
  revalidatePath("/companies");
  revalidatePath("/board");
  return count;
}

/**
 * Start outreach on a prospect deal from the Today "top prospects" card. Moves
 * the deal to outreach (which arms the stage default action) and revalidates
 * Today plus the shared pipeline views.
 */
export async function startProspectOutreachAction(dealId: number) {
  const actorUserId = await currentUserId();
  await updateDealStage(dealId, "outreach", actorUserId);
  revalidatePath("/");
  revalidatePath("/prospects");
  revalidatePath("/companies");
  revalidatePath("/board");
}

export async function quickAddNextActionAction(formData: FormData) {
  const dealId = Number(formData.get("dealId"));
  const title = String(formData.get("title") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();

  if (!dealId || !title || !dueDate) return;

  const actorUserId = await currentUserId();
  await createNextAction({ dealId, title, dueDate, createdBy: "manual" }, actorUserId);
  revalidatePath("/");
}
