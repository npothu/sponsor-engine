import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { addDays, formatISO } from "date-fns";
import { db } from "./db";
import {
  auditLog,
  cadenceSteps,
  deals,
  nextActions,
  templates,
  type AuditAction,
  type CadenceStep,
  type TouchpointChannel,
} from "./schema";

type CadenceDb = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Cadence progression engine.
 *
 * A cadence is an ordered list of follow-up steps (cadence_steps). A deal may be
 * assigned a cadence (deals.cadenceId) and tracks how far it has progressed with
 * deals.cadenceStepIndex - the index of the NEXT step to schedule.
 *
 * When you log a touchpoint on a deal, logTouchpoint() calls this so the
 * cadence keeps a fresh cadence-created next action alive (preserving the "next
 * action invariant") until either the prospect replies or the steps run out.
 *
 * Imports only from lib/db and lib/schema to avoid a circular import with
 * lib/data.ts (which imports this module).
 */

const CADENCE_CREATED = "cadence" as const;
const EXHAUSTED_TITLE = "Cadence exhausted - retire or recycle prospect";

function nowIso(): string {
  return formatISO(new Date());
}

/**
 * Local copy of lib/data.ts's logAudit(), duplicated rather than imported to
 * avoid the circular import noted above (lib/data.ts imports this module).
 * Must stay behaviorally identical to lib/data.ts's logAudit().
 */
async function logAudit(
  actorUserId: number | null,
  tableName: string,
  rowId: string | number,
  action: AuditAction,
  state: unknown,
  executor: CadenceDb = db,
): Promise<void> {
  const json = state == null ? null : JSON.stringify(state);
  await executor.insert(auditLog).values({
    userId: actorUserId,
    tableName,
    rowId: String(rowId),
    action,
    before: action === "delete" ? json : null,
    after: action === "delete" ? null : json,
  });
}

/** Steps of a cadence in ascending position order. */
async function stepsForCadence(
  cadenceId: number,
  executor: CadenceDb,
): Promise<CadenceStep[]> {
  return await executor
    .select()
    .from(cadenceSteps)
    .where(eq(cadenceSteps.cadenceId, cadenceId))
    .orderBy(asc(cadenceSteps.position))
    .all();
}

/** Open next actions on a deal that were created by the cadence engine. */
async function openCadenceActionIds(
  dealId: number,
  executor: CadenceDb,
): Promise<number[]> {
  return (await executor
    .select({ id: nextActions.id })
    .from(nextActions)
    .where(
      and(
        eq(nextActions.dealId, dealId),
        eq(nextActions.status, "open"),
        eq(nextActions.createdBy, CADENCE_CREATED),
      ),
    )
    .all())
    .map((r) => r.id);
}

/** Build a human-readable action title for a cadence step. */
async function stepTitle(
  step: CadenceStep,
  ordinal: number,
  executor: CadenceDb,
): Promise<string> {
  const channelLabel = step.channel.replace(/_/g, " ");
  let title = `Cadence step ${ordinal}: ${channelLabel} follow-up`;
  if (step.templateId != null) {
    const template = await executor
      .select({ name: templates.name })
      .from(templates)
      .where(eq(templates.id, step.templateId))
      .get();
    if (template) title = `Cadence step ${ordinal}: ${channelLabel} - ${template.name}`;
  }
  if (step.note) title = `${title} (${step.note})`;
  return title;
}

/**
 * Advance a deal's cadence after a touchpoint is logged.
 *
 * OUTBOUND: treat the just-logged touchpoint as "the step was sent". If the deal
 * already has an open cadence-created next action, do nothing (avoid piling up
 * duplicate follow-ups). Otherwise schedule the NEXT step's next action, due at
 * now + that step's waitDays, and advance cadenceStepIndex past it. When there
 * are no more steps, drop a final manual-review action instead.
 *
 * INBOUND: the prospect replied - a human takes over. Close every open
 * cadence-created next action and detach the cadence from the deal so the engine
 * stops scheduling automated follow-ups.
 */
export async function advanceCadenceAfterTouchpoint(
  dealId: number,
  direction: "outbound" | "inbound",
  actorUserId: number | null = null,
  channel?: TouchpointChannel,
  executor: CadenceDb = db,
): Promise<void> {
  const deal = await executor
    .select()
    .from(deals)
    .where(eq(deals.id, dealId))
    .get();
  if (!deal || deal.cadenceId == null) return;

  if (direction === "inbound") {
    const openIds = await openCadenceActionIds(dealId, executor);
    const now = nowIso();
    for (const id of openIds) {
      const row = await executor
        .update(nextActions)
        .set({ status: "done", doneAt: now })
        .where(eq(nextActions.id, id))
        .returning()
        .get();
      if (row) {
        await logAudit(
          actorUserId,
          "next_actions",
          row.id,
          "update",
          row,
          executor,
        );
      }
    }
    // Detach the cadence: the human now drives follow-up manually.
    const detachedDeal = await executor
      .update(deals)
      .set({ cadenceId: null, cadenceStepIndex: 0 })
      .where(eq(deals.id, dealId))
      .returning()
      .get();
    if (detachedDeal) {
      await logAudit(
        actorUserId,
        "deals",
        detachedDeal.id,
        "update",
        detachedDeal,
        executor,
      );
    }
    return;
  }

  // Outbound. Do not stack duplicate cadence follow-ups.
  if ((await openCadenceActionIds(dealId, executor)).length > 0) return;

  const steps = await stepsForCadence(deal.cadenceId, executor);
  const index = deal.cadenceStepIndex;

  // A LinkedIn touch must not consume an email cadence step (or vice versa).
  // At index 0 the touch kicks off step 1; later, it completes the previously
  // scheduled step at index - 1 before the engine schedules the next one.
  const completedStep = steps[index === 0 ? 0 : index - 1];
  if (channel && completedStep && completedStep.channel !== channel) return;

  if (index >= steps.length) {
    // Steps exhausted - schedule a one-time manual review, once.
    const exhausted = await executor
      .select({ id: nextActions.id })
      .from(nextActions)
      .where(
        and(
          eq(nextActions.dealId, dealId),
          eq(nextActions.title, EXHAUSTED_TITLE),
        ),
      )
      .get();
    if (!exhausted) {
      const row = await executor
        .insert(nextActions)
        .values({
          dealId,
          title: EXHAUSTED_TITLE,
          dueDate: formatISO(new Date(), { representation: "date" }),
          status: "open",
          createdBy: "manual",
        })
        .returning()
        .get();
      await logAudit(
        actorUserId,
        "next_actions",
        row.id,
        "insert",
        row,
        executor,
      );
    }
    return;
  }

  const step = steps[index];
  const dueDate = formatISO(addDays(new Date(), step.waitDays), {
    representation: "date",
  });

  const row = await executor
    .insert(nextActions)
    .values({
      dealId,
      title: await stepTitle(step, index + 1, executor),
      dueDate,
      status: "open",
      createdBy: CADENCE_CREATED,
    })
    .returning()
    .get();
  await logAudit(
    actorUserId,
    "next_actions",
    row.id,
    "insert",
    row,
    executor,
  );

  const advancedDeal = await executor
    .update(deals)
    .set({ cadenceStepIndex: index + 1 })
    .where(eq(deals.id, dealId))
    .returning()
    .get();
  if (advancedDeal) {
    await logAudit(
      actorUserId,
      "deals",
      advancedDeal.id,
      "update",
      advancedDeal,
      executor,
    );
  }
}
