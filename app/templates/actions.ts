"use server";

import { revalidatePath } from "next/cache";
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

function nonEmpty(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length ? s : null;
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  const name = nonEmpty(formData.get("name"));
  const body = typeof formData.get("body") === "string" ? (formData.get("body") as string) : "";
  if (!name || !body.trim()) return;

  const input: CreateTemplateInput = {
    name,
    scenario: nonEmpty(formData.get("scenario")),
    subject: nonEmpty(formData.get("subject")),
    body,
  };
  const actorUserId = await currentUserId();
  await createTemplate(input, actorUserId);
  revalidatePath("/templates");
}

export async function updateTemplateAction(
  id: number,
  formData: FormData,
): Promise<void> {
  const name = nonEmpty(formData.get("name"));
  const body = typeof formData.get("body") === "string" ? (formData.get("body") as string) : "";
  if (!name || !body.trim()) return;

  const input: UpdateTemplateInput = {
    name,
    scenario: nonEmpty(formData.get("scenario")),
    subject: nonEmpty(formData.get("subject")),
    body,
  };
  const actorUserId = await currentUserId();
  await updateTemplate(id, input, actorUserId);
  revalidatePath("/templates");
}

export async function deleteTemplateAction(id: number): Promise<void> {
  const actorUserId = await currentUserId();
  await deleteTemplate(id, actorUserId);
  revalidatePath("/templates");
}
