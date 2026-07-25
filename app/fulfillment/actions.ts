"use server";

import { revalidatePath } from "next/cache";
import {
  generateDealDeliverables,
  createDealDeliverable,
  updateDealDeliverable,
  deleteDealDeliverable,
  setTierDeliverableTemplates,
  buildFulfillmentRecap,
  type DeliverableStatus,
  type DeliverableTemplateInput,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

function optStr(value: FormDataEntryValue | null): string | null {
  const v = (value as string | null)?.trim() ?? "";
  return v.length ? v : null;
}

/** Instantiate a deal's tier-template deliverables (the Generate button). */
export async function generateDeliverablesAction(dealId: number) {
  const actorUserId = await currentUserId();
  await generateDealDeliverables(dealId, actorUserId);
  revalidatePath("/fulfillment");
}

/** Add a custom deliverable row to a deal. */
export async function addDeliverableAction(dealId: number, form: FormData) {
  const title = (form.get("title") as string | null)?.trim() ?? "";
  if (!title) return;
  const actorUserId = await currentUserId();
  await createDealDeliverable(
    {
      dealId,
      title,
      owner: optStr(form.get("owner")),
      dueDate: optStr(form.get("dueDate")),
    },
    actorUserId,
  );
  revalidatePath("/fulfillment");
}

/** Cycle a deliverable's status (open -> done -> open, or toggle blocked). */
export async function setDeliverableStatusAction(
  id: number,
  status: DeliverableStatus,
) {
  const actorUserId = await currentUserId();
  await updateDealDeliverable(id, { status }, actorUserId);
  revalidatePath("/fulfillment");
}

/** Inline-edit owner and/or due date for a deliverable. */
export async function updateDeliverableMetaAction(
  id: number,
  owner: string | null,
  dueDate: string | null,
) {
  const actorUserId = await currentUserId();
  await updateDealDeliverable(
    id,
    {
      owner: owner && owner.trim().length ? owner.trim() : null,
      dueDate: dueDate && dueDate.trim().length ? dueDate.trim() : null,
    },
    actorUserId,
  );
  revalidatePath("/fulfillment");
}

/** Inline-edit the proof link and/or headline metric for a deliverable. */
export async function updateDeliverableProofAction(
  id: number,
  proofUrl: string | null,
  metricValue: string | null,
) {
  const actorUserId = await currentUserId();
  await updateDealDeliverable(
    id,
    {
      proofUrl: proofUrl ?? "",
      metricValue: metricValue ?? "",
    },
    actorUserId,
  );
  revalidatePath("/fulfillment");
}

/** Remove a deliverable from a deal. */
export async function deleteDeliverableAction(id: number) {
  const actorUserId = await currentUserId();
  await deleteDealDeliverable(id, actorUserId);
  revalidatePath("/fulfillment");
}

/**
 * Build the sponsor-facing fulfillment recap Markdown for a deal. Returns an
 * empty string when the deal cannot be resolved, so the client can no-op safely.
 */
export async function buildRecapAction(dealId: number): Promise<string> {
  return (await buildFulfillmentRecap(dealId)) ?? "";
}

/** Replace the deliverable-template set for a tier. */
export async function saveTierTemplatesAction(
  tierId: number,
  items: DeliverableTemplateInput[],
) {
  const cleaned = items
    .map((it, i) => ({
      title: it.title.trim(),
      defaultOwner:
        it.defaultOwner && it.defaultOwner.trim().length
          ? it.defaultOwner.trim()
          : null,
      position: i,
    }))
    .filter((it) => it.title.length > 0);
  const actorUserId = await currentUserId();
  await setTierDeliverableTemplates(tierId, cleaned, actorUserId);
  revalidatePath("/fulfillment");
}
