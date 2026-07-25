"use server";

import { revalidatePath } from "next/cache";
import {
  createNextAction,
  logTouchpoint,
  type LogTouchpointInput,
} from "@/lib/data";
import type { TouchpointChannel, TouchpointDirection } from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";
import { addDays, formatISO } from "date-fns";
import {
  listCompanyOptions,
  listContactOptions,
  listDealOptions,
  listDeckVersionOptions,
  listTemplateOptions,
  type CompanyOption,
  type ContactOption,
  type DealOption,
  type TemplateOption,
} from "./queries";
import type { DeckVersion } from "@/lib/schema";

export interface QuickLogFormData {
  companies: CompanyOption[];
  contacts: ContactOption[];
  deals: DealOption[];
  deckVersions: DeckVersion[];
  templates: TemplateOption[];
}

/** Fetches everything the QuickLog modal's form needs, in one round trip. */
export async function getQuickLogFormData(): Promise<QuickLogFormData> {
  const [companies, contacts, deals, deckVersions, templates] =
    await Promise.all([
      listCompanyOptions(),
      listContactOptions(),
      listDealOptions(),
      listDeckVersionOptions(),
      listTemplateOptions(),
    ]);
  return { companies, contacts, deals, deckVersions, templates };
}

export interface LogTouchFormState {
  ok: boolean;
  error?: string;
  touchpointId?: number;
}

function toIntOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/**
 * Log a single touchpoint from either the QuickLog modal or the Backfill
 * rapid-entry form. Optionally creates a follow-up next action N days out.
 * Revalidates every route that surfaces touchpoints / next actions.
 */
export async function logTouchAction(
  _prevState: LogTouchFormState,
  formData: FormData,
): Promise<LogTouchFormState> {
  const companyId = toIntOrNull(formData.get("companyId"));
  if (!companyId) {
    return { ok: false, error: "Pick a company." };
  }

  const channel = String(formData.get("channel") || "email") as TouchpointChannel;
  const direction = String(
    formData.get("direction") || "outbound",
  ) as TouchpointDirection;

  const occurredAtRaw = toStringOrNull(formData.get("occurredAt"));
  const occurredAt = occurredAtRaw
    ? formatISO(new Date(occurredAtRaw))
    : undefined;

  const dealId = toIntOrNull(formData.get("dealId"));
  const contactId = toIntOrNull(formData.get("contactId"));
  const deckVersionId = toIntOrNull(formData.get("deckVersionId"));
  const summary = toStringOrNull(formData.get("summary"));
  const outcome = toStringOrNull(formData.get("outcome"));
  // A template only makes sense on an outbound touch (we sent it), so an inbound
  // direction never attributes a template regardless of what the form carried.
  const templateId =
    direction === "outbound" ? toIntOrNull(formData.get("templateId")) : null;

  const input: LogTouchpointInput = {
    companyId,
    dealId,
    contactId,
    channel,
    direction,
    occurredAt,
    summary,
    outcome,
    deckVersionId,
    templateId,
  };

  const actorUserId = await currentUserId();

  let touchpoint;
  try {
    touchpoint = await logTouchpoint(input, actorUserId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not log touchpoint.",
    };
  }

  const followUpDays = toIntOrNull(formData.get("followUpDays"));
  if (followUpDays && followUpDays > 0 && dealId) {
    const dueDate = formatISO(addDays(new Date(), followUpDays), {
      representation: "date",
    });
    await createNextAction(
      {
        dealId,
        title: "Follow up",
        dueDate,
        createdBy: "manual",
      },
      actorUserId,
    );
  }

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/companies");
  revalidatePath("/backfill");

  return { ok: true, touchpointId: touchpoint.id };
}
