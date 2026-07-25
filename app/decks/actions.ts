"use server";

import { revalidatePath } from "next/cache";
import {
  createDeckVersion,
  setCurrentDeckVersion,
  setDeckVersionUrl,
  type CreateDeckVersionInput,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

function nonEmpty(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length ? s : null;
}

export async function createDeckVersionAction(formData: FormData): Promise<void> {
  const label = nonEmpty(formData.get("label"));
  if (!label) return;

  const input: CreateDeckVersionInput = {
    label,
    description: nonEmpty(formData.get("description")),
    releasedAt: nonEmpty(formData.get("releasedAt")),
    url: nonEmpty(formData.get("url")),
    isCurrent: formData.get("isCurrent") === "on",
  };
  const actorUserId = await currentUserId();
  await createDeckVersion(input, actorUserId);
  revalidatePath("/decks");
}

export async function setCurrentDeckVersionAction(id: number): Promise<void> {
  const actorUserId = await currentUserId();
  await setCurrentDeckVersion(id, actorUserId);
  revalidatePath("/decks");
}

/** Update (or clear) the shareable link on a deck version. */
export async function setDeckVersionUrlAction(formData: FormData): Promise<void> {
  const idRaw = formData.get("deckVersionId");
  const id = Number(idRaw);
  if (!idRaw || Number.isNaN(id)) return;
  const actorUserId = await currentUserId();
  await setDeckVersionUrl(id, nonEmpty(formData.get("url")), actorUserId);
  revalidatePath("/decks");
}
