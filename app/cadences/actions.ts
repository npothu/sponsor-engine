"use server";

import { revalidatePath } from "next/cache";
import {
  assignCadenceToDeal,
  createCadence,
  setCadenceSteps,
  updateCadence,
  type CadenceStepInput,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";
import type { TouchpointChannel } from "@/lib/schema";

const CHANNELS: TouchpointChannel[] = [
  "email",
  "call",
  "meeting",
  "career_fair",
  "linkedin",
  "discord",
  "other",
];

function asChannel(value: FormDataEntryValue | null): TouchpointChannel {
  const v = String(value ?? "");
  return (CHANNELS as string[]).includes(v)
    ? (v as TouchpointChannel)
    : "email";
}

function optionalInt(value: FormDataEntryValue | null): number | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

export async function createCadenceAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim();
  const actorUserId = await currentUserId();
  await createCadence({ name, description: description || null }, actorUserId);
  revalidatePath("/cadences");
}

export async function updateCadenceAction(formData: FormData): Promise<void> {
  const id = optionalInt(formData.get("cadenceId"));
  if (id == null) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim();
  const actorUserId = await currentUserId();
  await updateCadence(id, { name, description: description || null }, actorUserId);
  revalidatePath("/cadences");
}

/**
 * Replace a cadence's steps from a repeatable form. The form submits parallel
 * arrays keyed waitDays/channel/templateId/note; empty rows (no channel) are
 * dropped and positions are reassigned 0..n in submitted order.
 */
export async function saveStepsAction(formData: FormData): Promise<void> {
  const cadenceId = optionalInt(formData.get("cadenceId"));
  if (cadenceId == null) return;

  const waitDaysList = formData.getAll("waitDays");
  const channelList = formData.getAll("channel");
  const templateList = formData.getAll("templateId");
  const noteList = formData.getAll("note");

  const rowCount = Math.max(
    waitDaysList.length,
    channelList.length,
    templateList.length,
    noteList.length,
  );

  const steps: CadenceStepInput[] = [];
  for (let i = 0; i < rowCount; i++) {
    const channel = asChannel(channelList[i] ?? null);
    const waitDays = optionalInt(waitDaysList[i] ?? null) ?? 0;
    const templateId = optionalInt(templateList[i] ?? null);
    const note = String(noteList[i] ?? "").trim();
    steps.push({
      position: steps.length,
      waitDays: waitDays < 0 ? 0 : waitDays,
      channel,
      templateId,
      note: note || null,
    });
  }

  const actorUserId = await currentUserId();
  await setCadenceSteps(cadenceId, steps, actorUserId);
  revalidatePath("/cadences");
}

export async function assignCadenceAction(formData: FormData): Promise<void> {
  const dealId = optionalInt(formData.get("dealId"));
  if (dealId == null) return;
  const cadenceId = optionalInt(formData.get("cadenceId"));
  const actorUserId = await currentUserId();
  await assignCadenceToDeal(dealId, cadenceId, actorUserId);
  revalidatePath("/cadences");
}
