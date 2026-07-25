"use server";

import { renderTemplate, type RenderedTemplate } from "@/lib/data";
import { db } from "@/lib/db";
import { contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type { Contact } from "@/lib/schema";

/**
 * lib/data.ts has no "contacts for a company" list helper on its own (only
 * getCompanyDetail returns contacts bundled with deals/touchpoints), so this
 * small helper reads the contacts table directly for the preview picker.
 */
export async function listContactsForCompany(companyId: number): Promise<Contact[]> {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, companyId))
    .orderBy(contacts.name)
    .all();
}

export async function renderTemplatePreview(
  templateId: number,
  companyId: number,
  contactId?: number,
  dealId?: number,
): Promise<RenderedTemplate | null> {
  return renderTemplate(templateId, companyId, contactId, dealId);
}
