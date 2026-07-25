"use server";

import { revalidatePath } from "next/cache";
import {
  updateDeal,
  updateDealStage,
  normalizeDealLostReason,
  setCompanyReAsk,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { deals } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type { DealLostReason, DealStage } from "@/lib/schema";

const STAGES: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
  "rejected",
];

/**
 * Move a deal to an explicit target stage from the board arrows.
 * - lapsed: records a structured loss reason; timing/budget losses also arm a
 *   dated re-ask on the company so the deferral resurfaces on Today.
 * - rejected: records why the company said no (no_fit, chose_competitor, etc.).
 */
export async function moveDealStage(
  dealId: number,
  stage: DealStage,
  lostReason?: DealLostReason | null,
  reAskOn?: string | null,
) {
  if (!STAGES.includes(stage)) return;
  const actorUserId = await currentUserId();
  await updateDealStage(dealId, stage, actorUserId);
  if (stage === "lapsed" || stage === "rejected") {
    const reason = normalizeDealLostReason(lostReason);
    if (reason) await updateDeal(dealId, { lostReason: reason }, actorUserId);
    if (stage === "lapsed" && (reason === "timing" || reason === "budget") && reAskOn) {
      const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
      if (deal) {
        await setCompanyReAsk(
          deal.companyId,
          reAskOn,
          `Lapsed on ${reason} - re-approach when the window reopens`,
          actorUserId,
        );
      }
    }
  }
  revalidatePath("/board");
  revalidatePath("/");
}
