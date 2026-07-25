"use server";

import { revalidatePath } from "next/cache";
import {
  attachInboxMessageToCompany,
  dismissInboxMessage,
  triageInboxMessageToDeal,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

export async function attachInboxMessageAction(formData: FormData): Promise<void> {
  const inboxId = Number(formData.get("inboxId"));
  const companyId = Number(formData.get("companyId"));
  const alsoLog = formData.get("alsoLog") === "on";
  if (!Number.isFinite(inboxId) || !Number.isFinite(companyId) || companyId <= 0) {
    return;
  }
  const actorUserId = await currentUserId();
  await attachInboxMessageToCompany(inboxId, companyId, alsoLog, actorUserId);
  revalidatePath("/discord");
}

/**
 * One-click triage: attach an interested message to a company, ensure a
 * current-cycle deal, nudge its stage to at least conversation, and create a
 * "Reply to inbound interest" action (without wiping existing open actions).
 */
export async function triageInboxMessageAction(
  formData: FormData,
): Promise<void> {
  const inboxId = Number(formData.get("inboxId"));
  const companyId = Number(formData.get("companyId"));
  if (
    !Number.isFinite(inboxId) ||
    !Number.isFinite(companyId) ||
    companyId <= 0
  ) {
    return;
  }
  const actorUserId = await currentUserId();
  await triageInboxMessageToDeal(inboxId, companyId, undefined, actorUserId);
  revalidatePath("/discord");
  revalidatePath("/companies");
  revalidatePath("/board");
  revalidatePath("/");
}

export async function dismissInboxMessageAction(formData: FormData): Promise<void> {
  const inboxId = Number(formData.get("inboxId"));
  if (!Number.isFinite(inboxId)) return;
  const actorUserId = await currentUserId();
  await dismissInboxMessage(inboxId, actorUserId);
  revalidatePath("/discord");
}
