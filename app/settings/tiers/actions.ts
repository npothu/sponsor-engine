"use server";

import { revalidatePath } from "next/cache";
import {
  createTier,
  updateTier,
  createAddon,
  updateAddon,
  type CreateTierInput,
  type UpdateTierInput,
  type CreateAddonInput,
  type UpdateAddonInput,
} from "@/lib/data";
import { currentUserId } from "@/lib/auth-context";

function str(form: FormData, key: string): string {
  return (form.get(key) as string | null)?.trim() ?? "";
}

function optStr(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v.length ? v : null;
}

export async function createTierAction(form: FormData) {
  const name = str(form, "name");
  const priceRaw = str(form, "price");
  if (!name || !priceRaw) return;

  const input: CreateTierInput = {
    name,
    price: Math.round(Number(priceRaw)),
    description: optStr(form, "description"),
    position: form.get("position") ? Number(str(form, "position")) : undefined,
    active: form.get("active") === "on",
    packageLabel: optStr(form, "packageLabel"),
  };
  const actorUserId = await currentUserId();
  await createTier(input, actorUserId);
  revalidatePath("/settings/tiers");
}

export async function updateTierAction(id: number, form: FormData) {
  const name = str(form, "name");
  const priceRaw = str(form, "price");
  if (!name || !priceRaw) return;

  const input: UpdateTierInput = {
    name,
    price: Math.round(Number(priceRaw)),
    description: optStr(form, "description"),
    position: form.get("position") ? Number(str(form, "position")) : undefined,
    packageLabel: optStr(form, "packageLabel"),
  };
  const actorUserId = await currentUserId();
  await updateTier(id, input, actorUserId);
  revalidatePath("/settings/tiers");
}

export async function toggleTierActiveAction(id: number, active: boolean) {
  const actorUserId = await currentUserId();
  await updateTier(id, { active }, actorUserId);
  revalidatePath("/settings/tiers");
}

export async function createAddonAction(form: FormData) {
  const name = str(form, "name");
  if (!name) return;

  const input: CreateAddonInput = {
    name,
    description: optStr(form, "description"),
    priceNote: optStr(form, "priceNote"),
  };
  const actorUserId = await currentUserId();
  await createAddon(input, actorUserId);
  revalidatePath("/settings/tiers");
}

export async function updateAddonAction(id: number, form: FormData) {
  const name = str(form, "name");
  if (!name) return;

  const input: UpdateAddonInput = {
    name,
    description: optStr(form, "description"),
    priceNote: optStr(form, "priceNote"),
  };
  const actorUserId = await currentUserId();
  await updateAddon(id, input, actorUserId);
  revalidatePath("/settings/tiers");
}
