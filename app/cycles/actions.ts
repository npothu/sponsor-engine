"use server";

import { revalidatePath } from "next/cache";
import {
  createCycle,
  rolloverCycle,
  setActiveCycle,
  type CreateCycleInput,
  type RolloverSummary,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

function str(form: FormData, key: string): string {
  return (form.get(key) as string | null)?.trim() ?? "";
}

function optStr(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v.length ? v : null;
}

export async function createCycleAction(form: FormData) {
  const label = str(form, "label");
  if (!label) return;

  const input: CreateCycleInput = {
    label,
    anchorEvent: optStr(form, "anchorEvent"),
    anchorEventDate: optStr(form, "anchorEventDate"),
    startsOn: optStr(form, "startsOn"),
    endsOn: optStr(form, "endsOn"),
    isActive: form.get("isActive") === "on",
  };
  const actorUserId = await currentUserId();
  await createCycle(input, actorUserId);
  revalidatePath("/cycles");
}

export async function setActiveCycleAction(id: number) {
  const actorUserId = await currentUserId();
  await setActiveCycle(id, actorUserId);
  revalidatePath("/cycles");
}

export async function runRolloverAction(
  fromLabel: string,
  toLabel: string,
): Promise<RolloverSummary | null> {
  if (!fromLabel || !toLabel || fromLabel === toLabel) return null;
  const actorUserId = await currentUserId();
  const summary = await rolloverCycle(fromLabel, toLabel, actorUserId);
  revalidatePath("/cycles");
  return summary;
}
