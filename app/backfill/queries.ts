import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  contacts,
  deals,
  deckVersions,
  templates,
  touchpoints,
  type Company,
  type Contact,
  type Deal,
  type DeckVersion,
} from "@/lib/schema";

/**
 * Small server-only query helpers for the QuickLog / Backfill feature that
 * aren't already exposed by lib/data.ts. Kept local to this feature's paths
 * per the "write inside your own files" rule - go straight to lib/db +
 * lib/schema rather than touching lib/data.ts.
 */

export interface CompanyOption {
  id: number;
  name: string;
  type: string;
}

/** All companies, lightest possible shape, for the searchable select. */
export async function listCompanyOptions(): Promise<CompanyOption[]> {
  return db
    .select({ id: companies.id, name: companies.name, type: companies.type })
    .from(companies)
    .orderBy(companies.name)
    .all();
}

export interface ContactOption {
  id: number;
  companyId: number;
  name: string;
  role: string | null;
}

/** All contacts, lightest shape, filtered client-side by companyId. */
export async function listContactOptions(): Promise<ContactOption[]> {
  return db
    .select({
      id: contacts.id,
      companyId: contacts.companyId,
      name: contacts.name,
      role: contacts.role,
    })
    .from(contacts)
    .orderBy(contacts.name)
    .all();
}

export interface DealOption {
  id: number;
  companyId: number;
  cycle: string;
  stage: string;
}

/** All deals, lightest shape, filtered client-side by companyId. */
export async function listDealOptions(): Promise<DealOption[]> {
  return db
    .select({
      id: deals.id,
      companyId: deals.companyId,
      cycle: deals.cycle,
      stage: deals.stage,
    })
    .from(deals)
    .orderBy(desc(deals.createdAt))
    .all();
}

/** Deck versions for the "deck version sent" select. */
export async function listDeckVersionOptions(): Promise<DeckVersion[]> {
  return db
    .select()
    .from(deckVersions)
    .orderBy(desc(deckVersions.isCurrent), desc(deckVersions.releasedAt))
    .all();
}

export interface TemplateOption {
  id: number;
  name: string;
  scenario: string | null;
}

/**
 * Templates, lightest shape, for the "template used" select. Citing a template
 * on an outbound touch is what feeds templateResponseRates() attribution.
 */
export async function listTemplateOptions(): Promise<TemplateOption[]> {
  return db
    .select({
      id: templates.id,
      name: templates.name,
      scenario: templates.scenario,
    })
    .from(templates)
    .orderBy(templates.name)
    .all();
}

export interface RecentTouchpointRow {
  id: number;
  companyId: number;
  companyName: string;
  contactId: number | null;
  contactName: string | null;
  channel: string;
  direction: string;
  occurredAt: string;
  summary: string | null;
  outcome: string | null;
  deckVersionLabel: string | null;
  createdAt: string;
}

/** Last N logged touchpoints across all companies, newest first, for the Backfill confidence list. */
export async function listRecentTouchpoints(limit = 20): Promise<RecentTouchpointRow[]> {
  const rows = await db
    .select({
      id: touchpoints.id,
      companyId: touchpoints.companyId,
      companyName: companies.name,
      contactId: touchpoints.contactId,
      contactName: contacts.name,
      channel: touchpoints.channel,
      direction: touchpoints.direction,
      occurredAt: touchpoints.occurredAt,
      summary: touchpoints.summary,
      outcome: touchpoints.outcome,
      deckVersionLabel: deckVersions.label,
      createdAt: touchpoints.createdAt,
    })
    .from(touchpoints)
    .innerJoin(companies, eq(touchpoints.companyId, companies.id))
    .leftJoin(contacts, eq(touchpoints.contactId, contacts.id))
    .leftJoin(deckVersions, eq(touchpoints.deckVersionId, deckVersions.id))
    .orderBy(desc(touchpoints.createdAt))
    .limit(limit)
    .all();
  return rows.map((r) => ({
    ...r,
    contactName: r.contactName ?? null,
    deckVersionLabel: r.deckVersionLabel ?? null,
  }));
}

export type { Company, Contact, Deal };
