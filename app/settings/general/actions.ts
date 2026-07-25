"use server";

import { revalidatePath } from "next/cache";
import { setSetting, setActiveCycle } from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

function str(form: FormData, key: string): string {
  return (form.get(key) as string | null)?.trim() ?? "";
}

/**
 * Persist the general settings form: revenue goal, anchor target, your name, and
 * the outreach proof-point fields (member count, hackathon reach, current
 * sponsors override, anchor event override).
 */
export async function updateGeneralSettingsAction(form: FormData) {
  const actorUserId = await currentUserId();
  const revenueGoal = str(form, "revenue_goal");
  const anchorTarget = str(form, "anchor_target");
  const weeklyQuota = str(form, "weekly_launch_quota");
  const yourName = str(form, "your_name");

  await setSetting("revenue_goal", revenueGoal || "0", actorUserId);
  await setSetting("anchor_target", anchorTarget || "0", actorUserId);
  // Blank clears the override so getWeeklyLaunchQuota falls back to its default.
  await setSetting("weekly_launch_quota", weeklyQuota, actorUserId);
  await setSetting("your_name", yourName, actorUserId);

  // Proof-point merge fields. Stored verbatim; blank clears the override so the
  // computed defaults (live sponsors, active-cycle anchor) take over.
  await setSetting("member_count", str(form, "member_count"), actorUserId);
  await setSetting("hackathon_reach", str(form, "hackathon_reach"), actorUserId);
  await setSetting("current_sponsors", str(form, "current_sponsors"), actorUserId);
  await setSetting("anchor_event", str(form, "anchor_event"), actorUserId);

  revalidatePath("/settings/general");
  revalidatePath("/revenue");
  revalidatePath("/");
}

/** Switch the active cycle; also updates the current_cycle setting via setActiveCycle. */
export async function setActiveCycleAction(form: FormData) {
  const cycleIdRaw = str(form, "cycleId");
  const cycleId = Number(cycleIdRaw);
  if (!cycleIdRaw || Number.isNaN(cycleId)) return;

  const actorUserId = await currentUserId();
  await setActiveCycle(cycleId, actorUserId);

  revalidatePath("/settings/general");
  revalidatePath("/revenue");
}
