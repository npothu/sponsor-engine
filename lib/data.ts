import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  formatISO,
  startOfWeek,
} from "date-fns";
import { db, ensureMigrated } from "./db";
import { advanceCadenceAfterTouchpoint } from "./cadence";
import {
  DISCORD_BOT_HEARTBEAT_KEY,
  parseBotHeartbeat,
  type BotHeartbeat,
} from "./discord-bot-heartbeat";
import {
  DISCORD_BOT_PAUSE_KEY,
  parseBotPause,
  type BotPause,
} from "./discord-bot-control";

// Kicks off the (memoized, in lib/db.ts) schema migration on module load.
// Deliberately not a top-level `await`: standalone scripts run via tsx treat
// this file as CommonJS (no "type": "module" in package.json), which cannot
// parse a top-level await. This is fire-and-forget rather than blocking -
// the tiny race window (a query landing before a brand-new table/column
// exists) only matters on the very first request after a fresh schema bump,
// self-heals on retry, and every script that needs certainty (e.g.
// scripts/create-user.mts) awaits ensureMigrated() itself before querying.
void ensureMigrated();
import {
  normalizeCompanyName,
  normalizeHost,
} from "@/app/prospects/dedupe";
import {
  contactInboxDedupeKey,
  normalizeRejectReason,
  suggestTriage,
  type ScrapedPerson,
} from "./contact-inbox";
import {
  addons,
  auditLog,
  cadences,
  cadenceSteps,
  companies,
  companySignals,
  contactInbox,
  contacts,
  cycles,
  dealAddons,
  dealDeliverables,
  deals,
  deckVersions,
  deliverableTemplates,
  discordInbox,
  importRuns,
  nextActions,
  settings,
  stageEvents,
  templates,
  tiers,
  touchpoints,
  users,
  type Addon,
  type AuditAction,
  type AuditLogEntry,
  type Cadence,
  type CadenceStep,
  type Company,
  type CompanyPriority,
  type CompanySignal,
  type CompanyType,
  type Contact,
  type ContactCategory,
  type ContactInboxRow,
  type ContactInboxStatus,
  type ContactType,
  type ContactWarmth,
  type Cycle,
  type Deal,
  type DealDeliverable,
  type DealLostReason,
  type DealSatisfaction,
  type DealStage,
  type DeckVersion,
  type DeliverableStatus,
  type DeliverableTemplate,
  type DiscordInboxMessage,
  type DiscordInboxStatus,
  type EmailStatus,
  type ImportRun,
  type LinkedinTouchType,
  type NewDiscordInboxMessage,
  type Setting,
  type NextAction,
  type NextActionStatus,
  type Template,
  type Tier,
  type Touchpoint,
  type TouchpointChannel,
  type TouchpointDirection,
  type User,
  type UserRole,
} from "./schema";

type DataExecutor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete"
>;

/**
 * lib/data.ts - the shared, typed, server-only data-access layer.
 *
 * Every route/server component/action should go through these functions rather
 * than touching drizzle or SQL directly. All functions are genuinely
 * asynchronous (backed by @libsql/client via drizzle-orm/libsql) and must be
 * awaited.
 */

// ===========================================================================
// Shared value/aggregate types
// ===========================================================================

/** A deal joined with its (optional) target tier. */
export interface DealWithTier extends Deal {
  tier: Tier | null;
}

/** A deal joined with its company (for the board). */
export interface DealWithCompany extends Deal {
  company: Company;
  tier: Tier | null;
  /** the company has the warm_path_available fit signal checked */
  hasWarmPath: boolean;
  /** the strongest warmth across the company's contacts, or null if none */
  topContactWarmth: ContactWarmth | null;
  /**
   * True when the company has at least one contact who can actually say yes -
   * a champion or budget_holder. When false the deal is "single-threaded", stuck
   * with gatekeepers/influencers who cannot sign the ask.
   */
  hasDecisionMaker: boolean;
}

/** Warmth ordering for picking the strongest contact (higher = warmer). */
const WARMTH_RANK: Record<ContactWarmth, number> = {
  cold: 0,
  warm: 1,
  hot: 2,
};

/** Per-company relationship summary used to badge deals on the board. */
interface CompanyRelationshipSummary {
  hasWarmPath: boolean;
  topContactWarmth: ContactWarmth | null;
  /** the company has a champion or budget_holder contact (can say yes) */
  hasDecisionMaker: boolean;
}

/**
 * Per-company relationship summary for a set of companies, used to badge deals
 * on the board. Returns, per company id, whether the warm_path_available signal
 * is checked, the strongest contact warmth, and whether any contact is a
 * decision-maker (champion / budget_holder). Companies with no contacts / no
 * checked signal simply map to defaults.
 */
async function warmthByCompany(
  companyIds: number[],
): Promise<Map<number, CompanyRelationshipSummary>> {
  const result = new Map<number, CompanyRelationshipSummary>();
  if (companyIds.length === 0) return result;
  const uniqueIds = Array.from(new Set(companyIds));

  const warmPathRows = await db
    .select({ companyId: companySignals.companyId })
    .from(companySignals)
    .where(
      and(
        inArray(companySignals.companyId, uniqueIds),
        eq(companySignals.signalKey, "warm_path_available"),
        eq(companySignals.checked, true),
      ),
    )
    .all();
  const warmPathIds = new Set(warmPathRows.map((r) => r.companyId));

  const contactRows = await db
    .select({
      companyId: contacts.companyId,
      warmth: contacts.warmth,
      contactType: contacts.contactType,
    })
    .from(contacts)
    .where(inArray(contacts.companyId, uniqueIds))
    .all();
  const topWarmth = new Map<number, ContactWarmth>();
  const decisionMakerIds = new Set<number>();
  for (const row of contactRows) {
    const w = (row.warmth as ContactWarmth) ?? "cold";
    const current = topWarmth.get(row.companyId);
    if (!current || WARMTH_RANK[w] > WARMTH_RANK[current]) {
      topWarmth.set(row.companyId, w);
    }
    const type = normalizeContactType(row.contactType);
    if (type === "champion" || type === "budget_holder") {
      decisionMakerIds.add(row.companyId);
    }
  }

  for (const id of uniqueIds) {
    result.set(id, {
      hasWarmPath: warmPathIds.has(id),
      topContactWarmth: topWarmth.get(id) ?? null,
      hasDecisionMaker: decisionMakerIds.has(id),
    });
  }
  return result;
}

/** A touchpoint enriched with its deck version and contact (both nullable). */
export interface TouchpointDetail extends Touchpoint {
  deckVersion: DeckVersion | null;
  contact: Contact | null;
}

/** Full aggregate returned by getCompanyDetail. */
export interface CompanyDetail {
  company: Company;
  contacts: Contact[];
  deals: DealWithTier[];
  touchpoints: TouchpointDetail[];
  openActions: NextAction[];
}

/** A cadence together with its ordered steps. */
export interface CadenceWithSteps extends Cadence {
  steps: CadenceStep[];
}

/** A due next action joined with its deal and company (for the Today view). */
export interface DueAction extends NextAction {
  deal: Deal;
  company: Company;
}

/** Staleness severity: past the SLA (warning) vs. far past it (critical). */
export type StaleSeverity = "warning" | "critical";

/** A stalled deal with its company and staleness metadata. */
export interface StalledDeal extends DealWithCompany {
  lastActivityAt: string;
  daysStale: number;
  /** the staleness SLA (in days) for this deal's stage */
  slaDays: number;
  /** days past the stage SLA (daysStale - slaDays), >= 0 */
  daysOverSla: number;
  /** critical once staleness reaches 2x the stage SLA, else warning */
  severity: StaleSeverity;
}

/** A company flagged as having seen an outdated deck. */
export interface OutdatedDeckCompany {
  company: Company;
  lastDeckVersion: DeckVersion;
  lastSharedAt: string;
}

/** Active pipeline stages - deals in these stages need the next-action invariant. */
export const ACTIVE_STAGES: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
] as const;

/**
 * The org's current sponsorship cycle. This is a single source of truth used by
 * new-company/new-deal creation and the dashboard's "this cycle" aggregates.
 * There is no settings table yet, so this is a constant; getCurrentCycle()
 * prefers the most recent cycle actually present in the data and falls back to
 * this constant when there are no deals.
 */
export const CURRENT_CYCLE = "2026-27";

/**
 * Resolve the current cycle string. Prefers the persisted `current_cycle`
 * setting (written by setActiveCycle and the seed), and falls back to the
 * CURRENT_CYCLE constant when the setting has never been written.
 */
export async function getCurrentCycle(): Promise<string> {
  return (await getSetting("current_cycle")) ?? CURRENT_CYCLE;
}

function nowIso(): string {
  return formatISO(new Date());
}

// ===========================================================================
// Companies
// ===========================================================================

/** Priority values in high->low order, for selects and default sorting. */
export const COMPANY_PRIORITIES: readonly CompanyPriority[] = [
  "high",
  "medium",
  "low",
] as const;

/**
 * SQL rank for company.priority so lists can sort high->medium->low. Unknown
 * values sort last. Mirrors the data-layer contract that priority is a plain
 * text enum with a documented set of values.
 */
export const PRIORITY_SORT_RANK = sql<number>`
  case ${companies.priority}
    when 'high' then 0
    when 'medium' then 1
    when 'low' then 2
    else 3
  end`;

/**
 * Coerce an arbitrary value to a valid CompanyPriority, falling back to
 * 'medium' for anything outside the allowed set (mirrors how the schema default
 * protects the column).
 */
export function normalizeCompanyPriority(
  value: string | null | undefined,
): CompanyPriority {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

export interface CompanyFilter {
  type?: CompanyType;
  priority?: CompanyPriority;
  /** case-insensitive substring match on name */
  search?: string;
}

export async function listCompanies(filter?: CompanyFilter): Promise<Company[]> {
  const conditions = [];
  if (filter?.type) conditions.push(eq(companies.type, filter.type));
  if (filter?.priority)
    conditions.push(eq(companies.priority, filter.priority));
  if (filter?.search) {
    conditions.push(
      sql`lower(${companies.name}) like ${"%" + filter.search.toLowerCase() + "%"}`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  // High priority first, await then alphabetical within each priority band.
  return db
    .select()
    .from(companies)
    .where(where)
    .orderBy(PRIORITY_SORT_RANK, companies.name)
    .all();
}

export async function getCompanyDetail(id: number): Promise<CompanyDetail | null> {
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .get();
  if (!company) return null;

  const companyContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, id))
    .orderBy(contacts.name)
    .all();

  const dealRows = await db
    .select({ deal: deals, tier: tiers })
    .from(deals)
    .leftJoin(tiers, eq(deals.targetTierId, tiers.id))
    .where(eq(deals.companyId, id))
    .orderBy(desc(deals.createdAt))
    .all();
  const companyDeals: DealWithTier[] = dealRows.map((r) => ({
    ...r.deal,
    tier: r.tier ?? null,
  }));

  const touchpointRows = await db
    .select({
      touchpoint: touchpoints,
      deckVersion: deckVersions,
      contact: contacts,
    })
    .from(touchpoints)
    .leftJoin(deckVersions, eq(touchpoints.deckVersionId, deckVersions.id))
    .leftJoin(contacts, eq(touchpoints.contactId, contacts.id))
    .where(eq(touchpoints.companyId, id))
    .orderBy(desc(touchpoints.occurredAt))
    .all();
  const companyTouchpoints: TouchpointDetail[] = touchpointRows.map((r) => ({
    ...r.touchpoint,
    deckVersion: r.deckVersion ?? null,
    contact: r.contact ?? null,
  }));

  const dealIds = companyDeals.map((d) => d.id);
  const openActions = dealIds.length
    ? await db
        .select()
        .from(nextActions)
        .where(
          and(
            inArray(nextActions.dealId, dealIds),
            eq(nextActions.status, "open"),
          ),
        )
        .orderBy(nextActions.dueDate)
        .all()
    : [];

  return {
    company,
    contacts: companyContacts,
    deals: companyDeals,
    touchpoints: companyTouchpoints,
    openActions,
  };
}

export interface CreateCompanyInput {
  name: string;
  type?: CompanyType;
  priority?: CompanyPriority;
  website?: string | null;
  source?: string | null;
  notes?: string | null;
  fitNotes?: string | null;
  importRunId?: number | null;
}

/** Resolve a website host, returning null when another company already owns it. */
export async function resolveUniqueHost(
  website: string | null | undefined,
  excludeCompanyId?: number,
): Promise<string | null> {
  const host = normalizeHost(website);
  if (!host) return null;
  const existing = await findCompanyByHost(host);
  if (existing && existing.id !== excludeCompanyId) return null;
  return host;
}

export async function createCompany(
  input: CreateCompanyInput,
  actorUserId: number | null = null,
): Promise<Company> {
  const row = await db
    .insert(companies)
    .values({
      name: input.name,
      normalizedName: normalizeCompanyName(input.name),
      host: await resolveUniqueHost(input.website),
      type: input.type ?? "corporate",
      priority: normalizeCompanyPriority(input.priority),
      website: input.website ?? null,
      source: input.source ?? null,
      notes: input.notes ?? null,
      fitNotes: input.fitNotes ?? null,
      importRunId: input.importRunId ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "companies", row.id, "insert", row);
  return row;
}

export interface UpdateCompanyInput {
  name?: string;
  type?: CompanyType;
  priority?: CompanyPriority;
  website?: string | null;
  source?: string | null;
  notes?: string | null;
  fitNotes?: string | null;
  reAskOn?: string | null;
  reAskReason?: string | null;
  fiscalYearEnd?: string | null;
  importRunId?: number | null;
}

export async function updateCompany(
  id: number,
  input: UpdateCompanyInput,
  actorUserId: number | null = null,
): Promise<Company | null> {
  // Guard the priority enum when present; other fields pass through as-is.
  const patch: UpdateCompanyInput & {
    normalizedName?: string;
    host?: string | null;
  } = { ...input };
  if (input.priority !== undefined) {
    patch.priority = normalizeCompanyPriority(input.priority);
  }
  if (input.fiscalYearEnd !== undefined) {
    patch.fiscalYearEnd = input.fiscalYearEnd?.trim()
      ? input.fiscalYearEnd.trim()
      : null;
  }
  if (input.name !== undefined) {
    patch.normalizedName = normalizeCompanyName(input.name);
  }
  if (input.website !== undefined) {
    patch.host = await resolveUniqueHost(input.website, id);
  }
  const row = await db
    .update(companies)
    .set(patch)
    .where(eq(companies.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "companies", row.id, "update", row);
  return row ?? null;
}

/** Find an existing company by its normalized website host (dedupe key). */
export async function findCompanyByHost(host: string | null | undefined): Promise<Company | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  return (
    await db.select().from(companies).where(eq(companies.host, normalized)).get() ??
    null
  );
}

/** Find an existing company by its normalized name (dedupe key). */
export async function findCompanyByNormalizedName(name: string): Promise<Company | null> {
  const normalized = normalizeCompanyName(name);
  return (
    await db
      .select()
      .from(companies)
      .where(eq(companies.normalizedName, normalized))
      .get() ?? null
  );
}

/** Start an import-run audit record before committing findings JSON. */
export async function createImportRun(
  label: string,
  findingsFile?: string | null,
  actorUserId: number | null = null,
): Promise<ImportRun> {
  const row = await db
    .insert(importRuns)
    .values({
      label,
      findingsFile: findingsFile ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "import_runs", row.id, "insert", row);
  return row;
}

/** Stamp the final records-written count when an import run finishes. */
export async function finishImportRun(
  id: number,
  recordsWritten: number,
  actorUserId: number | null = null,
): Promise<ImportRun | null> {
  const row = await db
    .update(importRuns)
    .set({ recordsWritten })
    .where(eq(importRuns.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "import_runs", row.id, "update", row);
  return row ?? null;
}

/**
 * Tag (or clear, with null) a company's expected/target sponsorship tier - the
 * dollar-potential axis of the prospect-pool rank. An unknown tier id is
 * ignored (treated as no change) so the rank stays well-defined.
 */
export async function setCompanyExpectedTier(
  companyId: number,
  tierId: number | null,
  actorUserId: number | null = null,
): Promise<Company | null> {
  if (tierId != null) {
    const tier = await db
      .select({ id: tiers.id })
      .from(tiers)
      .where(eq(tiers.id, tierId))
      .get();
    if (!tier) return null;
  }
  const row = await db
    .update(companies)
    .set({ expectedTierId: tierId })
    .where(eq(companies.id, companyId))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "companies", row.id, "update", row);
  return row ?? null;
}

/**
 * Set (or clear, with null) a company's dated re-approach signal. `reAskOn` is
 * an ISO date (YYYY-MM-DD); while it is in the future the company is suppressed
 * from the cold prospect pool and resurfaces on/after that date. The reason is
 * free text preserved across cycles so a successor board honors the promise.
 */
export async function setCompanyReAsk(
  companyId: number,
  reAskOn: string | null,
  reAskReason: string | null = null,
  actorUserId: number | null = null,
): Promise<Company | null> {
  const row = await db
    .update(companies)
    .set({ reAskOn, reAskReason: reAskOn ? reAskReason : null })
    .where(eq(companies.id, companyId))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "companies", row.id, "update", row);
  return row ?? null;
}

/**
 * Cross-cycle relationship classification for a company, used to stop
 * cold-emailing warm re-approaches:
 *   'do_not_contact_yet'  - has a re_ask_on in the FUTURE (a deferred promise;
 *                           resurfaces on/after that date, not before).
 *   'prior_relationship'  - has any deal in a PAST cycle, or a deal that ever
 *                           reached an engaged/late stage (conversation onward,
 *                           including a lapsed deal that got there).
 *   'cold'                - none of the above (never meaningfully engaged).
 * This survives exec-board turnover, so a successor treats a warm re-approach
 * differently from a genuinely cold prospect.
 */
export type CompanyRelationship =
  | "do_not_contact_yet"
  | "prior_relationship"
  | "cold";

/**
 * Stages that mark a company as having a real prior relationship (engaged past
 * mere outreach). A deal that reached any of these - even one that later lapsed -
 * is evidence of a warm history to re-approach, not a cold cold-email.
 */
const PRIOR_RELATIONSHIP_STAGES: readonly DealStage[] = [
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
  "rejected",
] as const;

export async function classifyCompanyRelationship(
  companyId: number,
): Promise<CompanyRelationship> {
  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!company) return "cold";

  const today = formatISO(new Date(), { representation: "date" });
  if (company.reAskOn && company.reAskOn > today) return "do_not_contact_yet";

  const currentCycle = await getCurrentCycle();
  const companyDeals = await db
    .select({ cycle: deals.cycle, stage: deals.stage })
    .from(deals)
    .where(eq(deals.companyId, companyId))
    .all();

  const engagedStages = new Set<string>(PRIOR_RELATIONSHIP_STAGES);
  for (const d of companyDeals) {
    // A deal in a past cycle, or one that ever reached an engaged stage, is a
    // prior relationship worth re-approaching warmly.
    if (d.cycle < currentCycle) return "prior_relationship";
    if (engagedStages.has(d.stage)) return "prior_relationship";
  }

  return "cold";
}

// ===========================================================================
// Contacts
// ===========================================================================

/** Contact-type values in decision-power order, for selects and defaults. */
export const CONTACT_TYPES: readonly ContactType[] = [
  "unknown",
  "gatekeeper",
  "influencer",
  "champion",
  "budget_holder",
] as const;

/**
 * Coerce an arbitrary value to a valid ContactType, falling back to 'unknown'
 * for anything outside the allowed set (mirrors normalizeContactWarmth /
 * normalizeCompanyPriority - the data layer owns enum validation).
 */
export function normalizeContactType(
  value: string | null | undefined,
): ContactType {
  return value === "gatekeeper" ||
    value === "influencer" ||
    value === "champion" ||
    value === "budget_holder" ||
    value === "unknown"
    ? value
    : "unknown";
}

/** Contact-category values for sourcing pipeline selects. */
export const CONTACT_CATEGORIES: readonly ContactCategory[] = [
  "university_relations",
  "erg_lead",
  "erg_officer",
  "alum_early_career",
  "channel_fallback",
] as const;

/**
 * Coerce an arbitrary value to a valid ContactCategory, or null for anything
 * outside the allowed set (including empty/absent).
 */
export function normalizeContactCategory(
  value: string | null | undefined,
): ContactCategory | null {
  return value != null &&
    (CONTACT_CATEGORIES as readonly string[]).includes(value)
    ? (value as ContactCategory)
    : null;
}

/** Email-status values for sourcing pipeline selects. */
export const EMAIL_STATUSES: readonly EmailStatus[] = [
  "verified",
  "inferred",
  "role_inbox",
  "bounced",
] as const;

/**
 * Coerce an arbitrary value to a valid EmailStatus, or null for anything
 * outside the allowed set (including empty/absent).
 */
export function normalizeEmailStatus(
  value: string | null | undefined,
): EmailStatus | null {
  return value != null && (EMAIL_STATUSES as readonly string[]).includes(value)
    ? (value as EmailStatus)
    : null;
}

export interface CreateContactInput {
  companyId: number;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  sourcedFrom?: string | null;
  warmth?: ContactWarmth;
  contactType?: ContactType;
  referredByContactId?: number | null;
  category?: ContactCategory | null;
  emailStatus?: EmailStatus | null;
  emailSource?: string | null;
  importRunId?: number | null;
  notes?: string | null;
}

export async function createContact(
  input: CreateContactInput,
  actorUserId: number | null = null,
): Promise<Contact> {
  const row = await db
    .insert(contacts)
    .values({
      companyId: input.companyId,
      name: input.name,
      role: input.role ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      linkedin: input.linkedin ?? null,
      sourcedFrom: input.sourcedFrom ?? null,
      warmth: input.warmth ?? "cold",
      contactType: normalizeContactType(input.contactType),
      referredByContactId: input.referredByContactId ?? null,
      category: normalizeContactCategory(input.category),
      emailStatus: normalizeEmailStatus(input.emailStatus),
      emailSource: input.emailSource ?? null,
      importRunId: input.importRunId ?? null,
      notes: input.notes ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "contacts", row.id, "insert", row);
  return row;
}

export interface UpdateContactInput {
  name?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  sourcedFrom?: string | null;
  warmth?: ContactWarmth;
  contactType?: ContactType;
  referredByContactId?: number | null;
  category?: ContactCategory | null;
  emailStatus?: EmailStatus | null;
  emailSource?: string | null;
  importRunId?: number | null;
  notes?: string | null;
}

export async function updateContact(
  id: number,
  input: UpdateContactInput,
  actorUserId: number | null = null,
): Promise<Contact | null> {
  // Guard enum columns when present; other fields pass through as-is.
  const patch: UpdateContactInput = { ...input };
  if (input.contactType !== undefined) {
    patch.contactType = normalizeContactType(input.contactType);
  }
  if (input.category !== undefined) {
    patch.category = normalizeContactCategory(input.category);
  }
  if (input.emailStatus !== undefined) {
    patch.emailStatus = normalizeEmailStatus(input.emailStatus);
  }
  const row = await db
    .update(contacts)
    .set(patch)
    .where(eq(contacts.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "contacts", row.id, "update", row);
  return row ?? null;
}

/**
 * Delete a contact, detaching everything that points at it first.
 *
 * touchpoints.contact_id and contact_inbox.contact_id are real foreign keys, so
 * a bare DELETE fails with SQLITE_CONSTRAINT for any contact that has ever been
 * logged against or triaged in - which is most of them. The history outlives the
 * link: touchpoints stay on the company (just anonymized), inbox rows keep their
 * kept/rejected decision, and the referral/champion pointers (plain columns, but
 * dangling all the same) are cleared.
 */
export async function deleteContact(
  id: number,
  actorUserId: number | null = null,
): Promise<void> {
  const before = await db.select().from(contacts).where(eq(contacts.id, id)).get();
  await db.transaction(async (tx) => {
    await tx
      .update(touchpoints)
      .set({ contactId: null })
      .where(eq(touchpoints.contactId, id))
      .run();
    await tx
      .update(contactInbox)
      .set({ contactId: null })
      .where(eq(contactInbox.contactId, id))
      .run();
    await tx
      .update(contacts)
      .set({ referredByContactId: null })
      .where(eq(contacts.referredByContactId, id))
      .run();
    await tx
      .update(deals)
      .set({ championContactId: null })
      .where(eq(deals.championContactId, id))
      .run();
    await tx.delete(contacts).where(eq(contacts.id, id)).run();
  });
  await logAudit(actorUserId, "contacts", id, "delete", before ?? null);
}

// ===========================================================================
// Deals
// ===========================================================================

/** Loss-reason values, for selects and the lapse prompt. */
export const DEAL_LOST_REASONS: readonly DealLostReason[] = [
  "budget",
  "timing",
  "no_response",
  "no_fit",
  "chose_competitor",
  "wrong_contact",
  "other",
] as const;

/** Human-readable label per loss reason (shared by the UI and rollover notes). */
export const DEAL_LOST_REASON_LABEL: Record<DealLostReason, string> = {
  budget: "Budget",
  timing: "Timing",
  no_response: "No response",
  no_fit: "No fit",
  chose_competitor: "Chose competitor",
  wrong_contact: "Wrong contact",
  other: "Other",
};

/**
 * Coerce an arbitrary value to a valid DealLostReason, or null for anything
 * outside the allowed set (including empty/absent). Mirrors the other enum
 * guards; the column is nullable, so "no reason given" is a legitimate null.
 */
export function normalizeDealLostReason(
  value: string | null | undefined,
): DealLostReason | null {
  return value != null && (DEAL_LOST_REASONS as readonly string[]).includes(value)
    ? (value as DealLostReason)
    : null;
}

/** All sponsor-satisfaction values in preference order (happy renews easiest). */
export const DEAL_SATISFACTIONS: readonly DealSatisfaction[] = [
  "happy",
  "neutral",
  "at_risk",
] as const;

/** Human-readable label per satisfaction value (shared by the UI). */
export const DEAL_SATISFACTION_LABEL: Record<DealSatisfaction, string> = {
  happy: "Happy",
  neutral: "Neutral",
  at_risk: "At risk",
};

/**
 * Renewal-preference rank per satisfaction: happy sponsors renew easiest, so
 * they sort first; a null (unassessed) sorts after the known-good and known-bad
 * so the rollover queue leads with confirmed-happy sponsors.
 */
export const DEAL_SATISFACTION_RANK: Record<DealSatisfaction, number> = {
  happy: 0,
  neutral: 1,
  at_risk: 2,
};

/**
 * Coerce an arbitrary value to a valid DealSatisfaction, or null for anything
 * outside the allowed set (including empty/absent). Mirrors the other enum
 * guards; the column is nullable, so "not assessed" is a legitimate null.
 */
export function normalizeDealSatisfaction(
  value: string | null | undefined,
): DealSatisfaction | null {
  return value != null &&
    (DEAL_SATISFACTIONS as readonly string[]).includes(value)
    ? (value as DealSatisfaction)
    : null;
}

export interface CreateDealInput {
  companyId: number;
  cycle: string;
  stage?: DealStage;
  targetTierId?: number | null;
  askAmount?: number | null;
  customTerms?: string | null;
  cadenceId?: number | null;
  cadenceStepIndex?: number;
  lostReason?: DealLostReason | null;
  championContactId?: number | null;
}

export async function createDeal(
  input: CreateDealInput,
  actorUserId: number | null = null,
): Promise<Deal> {
  const now = nowIso();
  const stage = input.stage ?? "prospect";
  const row = await db
    .insert(deals)
    .values({
      companyId: input.companyId,
      cycle: input.cycle,
      stage,
      targetTierId: input.targetTierId ?? null,
      askAmount: input.askAmount ?? null,
      customTerms: input.customTerms ?? null,
      cadenceId: input.cadenceId ?? null,
      cadenceStepIndex: input.cadenceStepIndex ?? 0,
      lostReason: normalizeDealLostReason(input.lostReason),
      championContactId: input.championContactId ?? null,
      stageEnteredAt: now,
      createdAt: now,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "deals", row.id, "insert", row);
  // Log the genesis transition (null -> initial stage) so the funnel counts
  // entries into the deal's first stage. recordStageEvent is defined below and
  // is safe to call here because functions are hoisted.
  await recordStageEvent(row.id, null, stage, db, now, actorUserId);
  return row;
}

export interface UpdateDealInput {
  cycle?: string;
  stage?: DealStage;
  targetTierId?: number | null;
  askAmount?: number | null;
  customTerms?: string | null;
  cadenceId?: number | null;
  cadenceStepIndex?: number;
  lostReason?: DealLostReason | null;
  satisfaction?: DealSatisfaction | null;
  championContactId?: number | null;
}

/**
 * Update arbitrary deal fields. If `stage` is included and changed, callers
 * should prefer updateDealStage() so stageEnteredAt is stamped; this function
 * will still stamp stageEnteredAt when a new stage differs from the current one.
 * The lostReason enum is guarded when present.
 */
export async function updateDeal(
  id: number,
  input: UpdateDealInput,
  actorUserId: number | null = null,
): Promise<Deal | null> {
  const current = await db.select().from(deals).where(eq(deals.id, id)).get();
  if (!current) return null;

  const patch: Partial<Deal> = { ...input };
  const stageChanged = input.stage != null && input.stage !== current.stage;
  if (stageChanged) {
    patch.stageEnteredAt = nowIso();
  }
  if (input.lostReason !== undefined) {
    patch.lostReason = normalizeDealLostReason(input.lostReason);
  }
  if (input.satisfaction !== undefined) {
    patch.satisfaction = normalizeDealSatisfaction(input.satisfaction);
  }

  const row = await db
    .update(deals)
    .set(patch)
    .where(eq(deals.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "deals", row.id, "update", row);
  // Any path that moves the stage feeds the stage-event history.
  if (stageChanged && row) {
    await recordStageEvent(
      id,
      current.stage as DealStage,
      input.stage as DealStage,
      db,
      patch.stageEnteredAt ?? nowIso(),
      actorUserId,
    );
  }
  return row ?? null;
}

/**
 * Per-stage default next action: the title and how many days out it is due when
 * a deal lands in that stage with no open next action. This is the map that
 * keeps the "next action invariant" alive at exactly the moments deals die -
 * every stage transition re-arms a follow-up unless one is already open.
 *
 * Terminal/holding stages (renewed, lapsed) are intentionally absent: a renewed
 * or lapsed deal does not need a chase action, so armNextActionForStage() leaves
 * them alone.
 */
export const STAGE_DEFAULT_ACTION: Readonly<
  Partial<Record<DealStage, { title: string; dueInDays: number }>>
> = {
  prospect: { title: "Start outreach", dueInDays: 2 },
  outreach: { title: "Send first outreach email", dueInDays: 0 },
  conversation: { title: "Follow up on the conversation", dueInDays: 2 },
  pitched: { title: "Follow up on the pitch", dueInDays: 3 },
  negotiating: { title: "Advance the negotiation", dueInDays: 2 },
  committed: { title: "Kick off fulfillment", dueInDays: 3 },
  fulfilling: { title: "Check on deliverables", dueInDays: 7 },
} as const;

/**
 * Ensure a deal in `stage` has an open next action, creating the per-stage
 * default one when it has none. This is the shared re-arm used by every stage
 * transition path. It NEVER duplicates: if any open next action already exists
 * on the deal (manual or cadence-created), it is a no-op, so a cadence-driven
 * follow-up or a hand-added action is always preferred over the generic default.
 * Stages absent from STAGE_DEFAULT_ACTION (renewed/lapsed) are left untouched.
 *
 * Accepts an optional transaction handle so callers advancing many deals in one
 * transaction (bulkStartOutreach) re-arm atomically with the stage move.
 */
export async function armNextActionForStage(
  dealId: number,
  stage: DealStage,
  tx: Pick<typeof db, "select" | "insert"> = db,
  actorUserId: number | null = null,
): Promise<void> {
  const def = STAGE_DEFAULT_ACTION[stage];
  if (!def) return;

  const open = await tx
    .select({ id: nextActions.id })
    .from(nextActions)
    .where(and(eq(nextActions.dealId, dealId), eq(nextActions.status, "open")))
    .get();
  if (open) return;

  const row = await tx.insert(nextActions)
    .values({
      dealId,
      title: def.title,
      dueDate: formatISO(addDays(new Date(), def.dueInDays), {
        representation: "date",
      }),
      status: "open",
      createdBy: "manual",
    })
    .returning()
    .get();
  await logAudit(actorUserId, "next_actions", row.id, "insert", row, tx);
}

/**
 * Append a stage-transition row to the stage_events log. Called on EVERY path
 * that mutates deals.stage (updateDealStage, bulkStartOutreach, board arrows via
 * updateDealStage, rollover creates fresh prospect deals), so the log is the
 * complete history behind conversion analytics. fromStage is null when the prior
 * stage is unknown (e.g. a brand-new deal's first stamp). Accepts an optional
 * transaction handle so callers advancing many deals atomically log in the same
 * transaction. A no-op when from and to are identical.
 */
export async function recordStageEvent(
  dealId: number,
  fromStage: DealStage | null,
  toStage: DealStage,
  tx: Pick<typeof db, "insert"> = db,
  at: string = nowIso(),
  actorUserId: number | null = null,
): Promise<void> {
  if (fromStage === toStage) return;
  const row = await tx.insert(stageEvents)
    .values({ dealId, fromStage: fromStage ?? null, toStage, enteredAt: at })
    .returning()
    .get();
  await logAudit(actorUserId, "stage_events", row.id, "insert", row, tx);
}

/**
 * Hard-delete a prospect-stage deal and its dependent rows. Only removes the
 * deal when it is still at the prospect stage - active pipeline deals are never
 * deleted here. Company-page cycle removal uses removeDealFromCycle instead.
 */
export async function removeDeal(
  dealId: number,
  actorUserId: number | null = null,
): Promise<void> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal || deal.stage !== "prospect") return;
  await deleteDealAndDependents(deal, actorUserId);
}

/**
 * Hard-delete a company's deal for a cycle regardless of stage (company profile
 * "remove from cycle"). Cascades next_actions, stage_events, deal_addons, and
 * deal_deliverables; touchpoints stay on the company with deal_id cleared.
 */
export async function removeDealFromCycle(
  dealId: number,
  actorUserId: number | null = null,
): Promise<void> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) return;
  await deleteDealAndDependents(deal, actorUserId);
}

async function deleteDealAndDependents(
  deal: typeof deals.$inferSelect,
  actorUserId: number | null,
): Promise<void> {
  const dealId = deal.id;

  const actionsToDelete = await db
    .select()
    .from(nextActions)
    .where(eq(nextActions.dealId, dealId))
    .all();
  await db.delete(nextActions).where(eq(nextActions.dealId, dealId)).run();
  for (const a of actionsToDelete) {
    await logAudit(actorUserId, "next_actions", a.id, "delete", a);
  }

  const eventsToDelete = await db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.dealId, dealId))
    .all();
  await db.delete(stageEvents).where(eq(stageEvents.dealId, dealId)).run();
  for (const e of eventsToDelete) {
    await logAudit(actorUserId, "stage_events", e.id, "delete", e);
  }

  const addonsToDelete = await db
    .select()
    .from(dealAddons)
    .where(eq(dealAddons.dealId, dealId))
    .all();
  await db.delete(dealAddons).where(eq(dealAddons.dealId, dealId)).run();
  for (const a of addonsToDelete) {
    await logAudit(
      actorUserId,
      "deal_addons",
      `${a.dealId}:${a.addonId}`,
      "delete",
      a,
    );
  }

  const deliverablesToDelete = await db
    .select()
    .from(dealDeliverables)
    .where(eq(dealDeliverables.dealId, dealId))
    .all();
  await db
    .delete(dealDeliverables)
    .where(eq(dealDeliverables.dealId, dealId))
    .run();
  for (const d of deliverablesToDelete) {
    await logAudit(actorUserId, "deal_deliverables", d.id, "delete", d);
  }

  // Detach touchpoints so company history survives; deal_id is nullable.
  const touchpointsToDetach = await db
    .select()
    .from(touchpoints)
    .where(eq(touchpoints.dealId, dealId))
    .all();
  await db
    .update(touchpoints)
    .set({ dealId: null })
    .where(eq(touchpoints.dealId, dealId))
    .run();
  for (const t of touchpointsToDetach) {
    await logAudit(actorUserId, "touchpoints", t.id, "update", {
      ...t,
      dealId: null,
    });
  }

  await db.delete(deals).where(eq(deals.id, dealId)).run();
  await logAudit(actorUserId, "deals", dealId, "delete", deal);
}

/**
 * Move a deal to a new stage, stamping stageEnteredAt, logging a stage_events
 * transition, then arm the per-stage default next action when the deal has no
 * open action (preserving the next-action invariant without ever duplicating an
 * existing follow-up).
 */
export async function updateDealStage(
  dealId: number,
  stage: DealStage,
  actorUserId: number | null = null,
): Promise<Deal | null> {
  const current = await db
    .select({ stage: deals.stage })
    .from(deals)
    .where(eq(deals.id, dealId))
    .get();
  const now = nowIso();
  const row = await db
    .update(deals)
    .set({ stage, stageEnteredAt: now })
    .where(eq(deals.id, dealId))
    .returning()
    .get();
  if (!row) return null;
  await logAudit(actorUserId, "deals", row.id, "update", row);
  await recordStageEvent(
    dealId,
    (current?.stage as DealStage | undefined) ?? null,
    stage,
    db,
    now,
    actorUserId,
  );
  await armNextActionForStage(dealId, stage, db, actorUserId);
  return row;
}

/**
 * Advance a batch of deals into outreach in one transaction, optionally
 * assigning a cadence to each. Only deals currently in the prospect stage are
 * advanced (so re-submitting or a stale checkbox never regresses a later deal);
 * every eligible move plus its cadence assignment commit atomically. Returns
 * the count actually advanced.
 */
export async function bulkStartOutreach(
  dealIds: number[],
  cadenceId?: number | null,
  actorUserId: number | null = null,
): Promise<number> {
  const unique = Array.from(new Set(dealIds));
  if (unique.length === 0) return 0;

  return await db.transaction(async (tx) => {
    const now = nowIso();
    let advanced = 0;
    for (const dealId of unique) {
      const current = await tx
        .select({ stage: deals.stage })
        .from(deals)
        .where(eq(deals.id, dealId))
        .get();
      if (!current || current.stage !== "prospect") continue;

      const updatedRow = await tx.update(deals)
        .set({ stage: "outreach", stageEnteredAt: now })
        .where(eq(deals.id, dealId))
        .returning()
        .get();
      await logAudit(actorUserId, "deals", dealId, "update", updatedRow);

      if (cadenceId != null) {
        const cadenceRow = await tx.update(deals)
          .set({ cadenceId, cadenceStepIndex: 0 })
          .where(eq(deals.id, dealId))
          .returning()
          .get();
        await logAudit(actorUserId, "deals", dealId, "update", cadenceRow);
      }
      // Log the transition into the stage-event history (prospect -> outreach).
      await recordStageEvent(dealId, "prospect", "outreach", tx, now, actorUserId);
      // Keep the next-action invariant alive on every advanced deal.
      await armNextActionForStage(dealId, "outreach", tx, actorUserId);
      advanced += 1;
    }
    return advanced;
  });
}

/** All deals (optionally filtered to a cycle) joined with company + tier, for the board. */
export async function listDealsWithCompany(cycle?: string): Promise<DealWithCompany[]> {
  const rows = await db
    .select({ deal: deals, company: companies, tier: tiers })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(tiers, eq(deals.targetTierId, tiers.id))
    .where(cycle ? eq(deals.cycle, cycle) : undefined)
    .orderBy(companies.name)
    .all();
  const warmth = await warmthByCompany(rows.map((r) => r.company.id));
  return rows.map((r) => ({
    ...r.deal,
    company: r.company,
    tier: r.tier ?? null,
    hasWarmPath: warmth.get(r.company.id)?.hasWarmPath ?? false,
    topContactWarmth: warmth.get(r.company.id)?.topContactWarmth ?? null,
    hasDecisionMaker: warmth.get(r.company.id)?.hasDecisionMaker ?? false,
  }));
}

/**
 * Active-stage deals that have no OPEN next action - i.e. deals violating the
 * "next action invariant". Used by the Backfill view.
 */
export async function dealsMissingNextAction(): Promise<DealWithCompany[]> {
  const openCounts = db
    .select({
      dealId: nextActions.dealId,
      openCount: sql<number>`count(*)`.as("open_count"),
    })
    .from(nextActions)
    .where(eq(nextActions.status, "open"))
    .groupBy(nextActions.dealId)
    .as("open_counts");

  const rows = await db
    .select({ deal: deals, company: companies, tier: tiers })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(tiers, eq(deals.targetTierId, tiers.id))
    .leftJoin(openCounts, eq(openCounts.dealId, deals.id))
    .where(
      and(
        inArray(deals.stage, ACTIVE_STAGES as DealStage[]),
        or(isNull(openCounts.openCount), eq(openCounts.openCount, 0)),
      ),
    )
    .orderBy(companies.name)
    .all();

  const warmth = await warmthByCompany(rows.map((r) => r.company.id));
  return rows.map((r) => ({
    ...r.deal,
    company: r.company,
    tier: r.tier ?? null,
    hasWarmPath: warmth.get(r.company.id)?.hasWarmPath ?? false,
    topContactWarmth: warmth.get(r.company.id)?.topContactWarmth ?? null,
    hasDecisionMaker: warmth.get(r.company.id)?.hasDecisionMaker ?? false,
  }));
}

/**
 * Per-stage staleness SLA in days: how long a deal may sit with no activity
 * before it counts as stalled. Later, higher-stakes stages have tighter SLAs -
 * a negotiating deal silent 3 days is an emergency, a prospect can wait 14.
 * Stages absent from this map (e.g. renewed/lapsed) are never flagged stalled.
 */
export const STAGE_STALE_SLA: Readonly<Partial<Record<DealStage, number>>> = {
  prospect: 14,
  outreach: 7,
  conversation: 5,
  pitched: 4,
  negotiating: 3,
  committed: 5,
  fulfilling: 10,
} as const;

/**
 * Active-stage deals whose last activity (max of stageEnteredAt and the most
 * recent touchpoint occurredAt) is older than the deal's per-stage SLA. Each
 * result carries its SLA, how far past it the deal is, and a severity that goes
 * critical at 2x the SLA. Pass `overrideDays` to force a single flat cutoff
 * across all stages instead of the per-stage map.
 */
export async function stalledDeals(overrideDays?: number): Promise<StalledDeal[]> {
  const lastTouch = db
    .select({
      dealId: touchpoints.dealId,
      lastAt: sql<string>`max(${touchpoints.occurredAt})`.as("last_at"),
    })
    .from(touchpoints)
    .groupBy(touchpoints.dealId)
    .as("last_touch");

  const rows = await db
    .select({
      deal: deals,
      company: companies,
      tier: tiers,
      lastTouchAt: lastTouch.lastAt,
    })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(tiers, eq(deals.targetTierId, tiers.id))
    .leftJoin(lastTouch, eq(lastTouch.dealId, deals.id))
    .where(inArray(deals.stage, ACTIVE_STAGES as DealStage[]))
    .all();

  const warmth = await warmthByCompany(rows.map((r) => r.company.id));
  const stalled: StalledDeal[] = [];
  for (const r of rows) {
    const slaDays =
      overrideDays ?? STAGE_STALE_SLA[r.deal.stage as DealStage];
    if (slaDays == null) continue;

    const lastActivityAt =
      r.lastTouchAt && r.lastTouchAt > r.deal.stageEnteredAt
        ? r.lastTouchAt
        : r.deal.stageEnteredAt;
    const daysStale = Math.floor(
      (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000,
    );
    if (daysStale < slaDays) continue;

    stalled.push({
      ...r.deal,
      company: r.company,
      tier: r.tier ?? null,
      hasWarmPath: warmth.get(r.company.id)?.hasWarmPath ?? false,
      topContactWarmth: warmth.get(r.company.id)?.topContactWarmth ?? null,
      hasDecisionMaker: warmth.get(r.company.id)?.hasDecisionMaker ?? false,
      lastActivityAt,
      daysStale,
      slaDays,
      daysOverSla: daysStale - slaDays,
      severity: daysStale >= slaDays * 2 ? "critical" : "warning",
    });
  }
  // Most-overdue first: rank by how far past its own SLA the deal is.
  stalled.sort((a, b) => b.daysOverSla - a.daysOverSla || b.daysStale - a.daysStale);
  return stalled;
}

/**
 * Name of the seeded default cold-outreach cadence. Re-engagement re-arms this
 * cadence on a stalled deal that has none, so future follow-ups are one click.
 */
export const DEFAULT_CADENCE_NAME = "Default cold outreach";

/** The default cold-outreach cadence, resolved by name, or null when absent. */
export async function getDefaultCadence(): Promise<Cadence | null> {
  return (
    await db
      .select()
      .from(cadences)
      .where(eq(cadences.name, DEFAULT_CADENCE_NAME))
      .get() ?? null
  );
}

export interface ReEngageResult {
  dealId: number;
  /** true when a fresh next action was created (deal had none open) */
  createdAction: boolean;
  /** true when the default cadence was re-armed (deal had no cadence) */
  armedCadence: boolean;
}

/**
 * Re-engage a stalled deal: guarantee it has a dated open next action and, when
 * it has no cadence, re-arm the default cold-outreach cadence so follow-ups flow
 * again. Never wipes an existing open action (idempotent - re-running is safe).
 * `dueInDays` controls when the re-engage action is due (default: tomorrow).
 */
export async function reEngageDeal(
  dealId: number,
  dueInDays = 1,
  actorUserId: number | null = null,
): Promise<ReEngageResult> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) {
    return { dealId, createdAction: false, armedCadence: false };
  }

  let armedCadence = false;
  if (deal.cadenceId == null) {
    const def = await getDefaultCadence();
    if (def) {
      await assignCadenceToDeal(dealId, def.id, actorUserId);
      armedCadence = true;
    }
  }

  const open = await db
    .select({ id: nextActions.id })
    .from(nextActions)
    .where(and(eq(nextActions.dealId, dealId), eq(nextActions.status, "open")))
    .get();

  let createdAction = false;
  if (!open) {
    await createNextAction(
      {
        dealId,
        title: `Re-engage - ${deal.stage} deal stalled`,
        dueDate: formatISO(addDays(new Date(), dueInDays), {
          representation: "date",
        }),
        createdBy: "manual",
      },
      actorUserId,
    );
    createdAction = true;
  }

  return { dealId, createdAction, armedCadence };
}

/**
 * Bulk re-engage the high-priority stalled deals. Resolves the current stalled
 * set, filters to companies with priority 'high', and re-engages each. Returns
 * the number of deals touched.
 */
export async function reEngageHighPriorityStalled(
  actorUserId: number | null = null,
): Promise<number> {
  const stalled = await stalledDeals();
  let count = 0;
  for (const d of stalled) {
    if (normalizeCompanyPriority(d.company.priority) !== "high") continue;
    await reEngageDeal(d.id, 1, actorUserId);
    count += 1;
  }
  return count;
}

// ===========================================================================
// Touchpoints
// ===========================================================================

export interface LogTouchpointInput {
  companyId: number;
  dealId?: number | null;
  contactId?: number | null;
  channel: TouchpointChannel;
  direction: TouchpointDirection;
  occurredAt?: string;
  summary?: string | null;
  outcome?: string | null;
  deckVersionId?: number | null;
  /** template cited by this touch (nullable), for response-rate attribution */
  templateId?: number | null;
}

/**
 * Log an interaction. After insert, if the touchpoint is tied to a deal, we
 * call advanceCadenceAfterTouchpoint() so the cadence engine (feature agent)
 * can progress follow-ups. Currently that call is a no-op stub.
 */
export async function logTouchpoint(
  input: LogTouchpointInput,
  actorUserId: number | null = null,
): Promise<Touchpoint> {
  const row = await db
    .insert(touchpoints)
    .values({
      companyId: input.companyId,
      dealId: input.dealId ?? null,
      contactId: input.contactId ?? null,
      channel: input.channel,
      direction: input.direction,
      occurredAt: input.occurredAt ?? nowIso(),
      summary: input.summary ?? null,
      outcome: input.outcome ?? null,
      deckVersionId: input.deckVersionId ?? null,
      templateId: input.templateId ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "touchpoints", row.id, "insert", row);

  if (row.dealId != null) {
    await advanceCadenceAfterTouchpoint(
      row.dealId,
      row.direction as TouchpointDirection,
      actorUserId,
      row.channel as TouchpointChannel,
    );
  }

  return row;
}

export interface UpdateTouchpointInput {
  dealId?: number | null;
  contactId?: number | null;
  channel?: TouchpointChannel;
  direction?: TouchpointDirection;
  occurredAt?: string;
  summary?: string | null;
  outcome?: string | null;
  deckVersionId?: number | null;
}

/**
 * Correct an already-logged touchpoint. Unlike logTouchpoint this never
 * advances a cadence: the touch was counted when it was first logged, and
 * fixing a typo on it must not push the sequence forward a second time.
 */
export async function updateTouchpoint(
  id: number,
  input: UpdateTouchpointInput,
  actorUserId: number | null = null,
): Promise<Touchpoint | null> {
  const row = await db
    .update(touchpoints)
    .set(input)
    .where(eq(touchpoints.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "touchpoints", row.id, "update", row);
  return row ?? null;
}

export async function listTouchpoints(companyId: number): Promise<TouchpointDetail[]> {
  const rows = await db
    .select({
      touchpoint: touchpoints,
      deckVersion: deckVersions,
      contact: contacts,
    })
    .from(touchpoints)
    .leftJoin(deckVersions, eq(touchpoints.deckVersionId, deckVersions.id))
    .leftJoin(contacts, eq(touchpoints.contactId, contacts.id))
    .where(eq(touchpoints.companyId, companyId))
    .orderBy(desc(touchpoints.occurredAt))
    .all();
  return rows.map((r) => ({
    ...r.touchpoint,
    deckVersion: r.deckVersion ?? null,
    contact: r.contact ?? null,
  }));
}

// ===========================================================================
// Next actions
// ===========================================================================

/** All OPEN next actions, ordered by due date, joined with deal + company. */
export async function listDueActions(): Promise<DueAction[]> {
  const rows = await db
    .select({ action: nextActions, deal: deals, company: companies })
    .from(nextActions)
    .innerJoin(deals, eq(nextActions.dealId, deals.id))
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .where(eq(nextActions.status, "open"))
    .orderBy(nextActions.dueDate)
    .all();
  return rows.map((r) => ({ ...r.action, deal: r.deal, company: r.company }));
}

export interface CreateNextActionInput {
  dealId: number;
  title: string;
  dueDate: string;
  owner?: string | null;
  createdBy?: "manual" | "cadence";
  status?: NextActionStatus;
}

export async function createNextAction(
  input: CreateNextActionInput,
  actorUserId: number | null = null,
): Promise<NextAction> {
  const row = await db
    .insert(nextActions)
    .values({
      dealId: input.dealId,
      title: input.title,
      dueDate: input.dueDate,
      owner: input.owner?.trim() || null,
      status: input.status ?? "open",
      createdBy: input.createdBy ?? "manual",
    })
    .returning()
    .get();
  await logAudit(actorUserId, "next_actions", row.id, "insert", row);
  return row;
}

/** Mark a next action done, stamping doneAt. */
export async function completeNextAction(
  id: number,
  actorUserId: number | null = null,
): Promise<NextAction | null> {
  const row = await db
    .update(nextActions)
    .set({ status: "done", doneAt: nowIso() })
    .where(eq(nextActions.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "next_actions", row.id, "update", row);
  return row ?? null;
}

/** Push a next action's due date out by `days` days. */
export async function snoozeNextAction(
  id: number,
  days: number,
  actorUserId: number | null = null,
): Promise<NextAction | null> {
  const current = await db
    .select()
    .from(nextActions)
    .where(eq(nextActions.id, id))
    .get();
  if (!current) return null;
  const base = new Date(current.dueDate);
  const nextDue = formatISO(addDays(base, days), { representation: "date" });
  const row = await db
    .update(nextActions)
    .set({ dueDate: nextDue })
    .where(eq(nextActions.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "next_actions", row.id, "update", row);
  return row ?? null;
}

/**
 * The channel to prefill when logging "sent" from a due action: for a
 * cadence-created action, the channel of the step that scheduled it (index - 1);
 * otherwise email. Kept beside logSentForAction so both share the resolution.
 */
async function channelForAction(action: NextAction): Promise<TouchpointChannel> {
  const deal = await db.select().from(deals).where(eq(deals.id, action.dealId)).get();
  if (deal?.cadenceId != null) {
    const steps = await db
      .select()
      .from(cadenceSteps)
      .where(eq(cadenceSteps.cadenceId, deal.cadenceId))
      .orderBy(asc(cadenceSteps.position))
      .all();
    const step = steps[deal.cadenceStepIndex - 1];
    if (step) return step.channel as TouchpointChannel;
  }
  return "email";
}

export interface LogSentResult {
  touchpoint: Touchpoint;
  completedActionId: number;
}

/**
 * One-click "log sent + advance + schedule next" from a due action.
 *
 * Order matters and is load-bearing against the cadence engine:
 *   1. Complete the current action FIRST. The outbound branch of
 *      advanceCadenceAfterTouchpoint refuses to schedule a next step while an
 *      open cadence-created action exists, so we must clear this one before
 *      logging.
 *   2. Log an OUTBOUND touchpoint on the deal (channel prefilled from the
 *      cadence step, else email). Because it is tied to the deal, logTouchpoint
 *      calls advanceCadenceAfterTouchpoint, which schedules the NEXT cadence step.
 *   3. For a manual/no-cadence deal there is no cadence to advance, so re-arm the
 *      per-stage default action to keep the next-action invariant alive.
 *
 * Returns null when the action does not exist.
 */
export async function logSentForAction(
  actionId: number,
  summary?: string | null,
  actorUserId: number | null = null,
): Promise<LogSentResult | null> {
  const action = await db
    .select()
    .from(nextActions)
    .where(eq(nextActions.id, actionId))
    .get();
  if (!action) return null;

  const deal = await db.select().from(deals).where(eq(deals.id, action.dealId)).get();
  if (!deal) return null;

  const channel = await channelForAction(action);

  // 1. Clear the current action so the cadence engine will schedule the next.
  await completeNextAction(actionId, actorUserId);

  // Attribute to the company's first emailable contact, when there is one.
  const companyContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, deal.companyId))
    .all();
  const contact = companyContacts.find((c) => c.email) ?? null;

  // 2. Log the outbound touch; this advances the cadence when one is attached.
  const touchpoint = await logTouchpoint(
    {
      companyId: deal.companyId,
      dealId: deal.id,
      contactId: contact?.id ?? null,
      channel,
      direction: "outbound",
      summary: summary ?? action.title,
    },
    actorUserId,
  );

  // 3. No cadence to advance -> fall back to the stage-based default action.
  if (deal.cadenceId == null) {
    await armNextActionForStage(deal.id, deal.stage as DealStage, db, actorUserId);
  }

  return { touchpoint, completedActionId: actionId };
}

/**
 * Pipeline order of the active stages, for "is this deal earlier than X" checks.
 * Terminal stages (renewed/lapsed) are not part of the forward path.
 */
const STAGE_ORDER: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
] as const;

export interface ReplyResult {
  touchpoint: Touchpoint;
  /** true when this call advanced the deal into the conversation stage */
  advancedToConversation: boolean;
}

/**
 * "Got a reply": log an INBOUND touchpoint on the deal. Because logTouchpoint
 * routes inbound touches through advanceCadenceAfterTouchpoint, this closes any
 * open cadence-created actions and detaches the cadence (a human now drives
 * follow-up). When `advanceToConversation` is set and the deal is still earlier
 * than the conversation stage, it is moved to conversation (updateDealStage then
 * arms the stage default action). Returns null when the deal does not exist.
 */
export async function logReplyForDeal(
  dealId: number,
  options?: { advanceToConversation?: boolean; contactId?: number | null; summary?: string | null },
  actorUserId: number | null = null,
): Promise<ReplyResult | null> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) return null;

  const touchpoint = await logTouchpoint(
    {
      companyId: deal.companyId,
      dealId: deal.id,
      contactId: options?.contactId ?? null,
      channel: "email",
      direction: "inbound",
      summary: options?.summary ?? "Reply received",
    },
    actorUserId,
  );

  let advancedToConversation = false;
  if (options?.advanceToConversation) {
    const currentIdx = STAGE_ORDER.indexOf(deal.stage as DealStage);
    const conversationIdx = STAGE_ORDER.indexOf("conversation");
    // Only nudge forward - never regress a deal already past conversation.
    if (currentIdx !== -1 && currentIdx < conversationIdx) {
      await updateDealStage(dealId, "conversation", actorUserId);
      advancedToConversation = true;
    }
  }

  return { touchpoint, advancedToConversation };
}

// ===========================================================================
// Deck versions
// ===========================================================================

export async function listDeckVersions(): Promise<DeckVersion[]> {
  return await db
    .select()
    .from(deckVersions)
    .orderBy(desc(deckVersions.isCurrent), desc(deckVersions.releasedAt))
    .all();
}

export interface CreateDeckVersionInput {
  label: string;
  description?: string | null;
  releasedAt?: string | null;
  /** shareable link to the deck/packet (nullable) */
  url?: string | null;
  isCurrent?: boolean;
}

export async function createDeckVersion(
  input: CreateDeckVersionInput,
  actorUserId: number | null = null,
): Promise<DeckVersion> {
  const row = await db
    .insert(deckVersions)
    .values({
      label: input.label,
      description: input.description ?? null,
      releasedAt: input.releasedAt ?? nowIso(),
      url: input.url ?? null,
      isCurrent: input.isCurrent ?? false,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "deck_versions", row.id, "insert", row);
  if (row.isCurrent) await setCurrentDeckVersion(row.id, actorUserId);
  return row;
}

/** Update a deck version's shareable link (null clears it). */
export async function setDeckVersionUrl(
  id: number,
  url: string | null,
  actorUserId: number | null = null,
): Promise<DeckVersion | null> {
  const row = await db
    .update(deckVersions)
    .set({ url: url && url.trim() ? url.trim() : null })
    .where(eq(deckVersions.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "deck_versions", row.id, "update", row);
  return row ?? null;
}

/** The shareable link on the current deck version, or "" when none is set. */
export async function getCurrentDeckLink(): Promise<string> {
  const current = await db
    .select({ url: deckVersions.url })
    .from(deckVersions)
    .where(eq(deckVersions.isCurrent, true))
    .get();
  return current?.url?.trim() ?? "";
}

/** Mark one deck version current and clear the flag on all others. */
export async function setCurrentDeckVersion(
  id: number,
  actorUserId: number | null = null,
): Promise<DeckVersion | null> {
  const previouslyCurrent = await db
    .select()
    .from(deckVersions)
    .where(eq(deckVersions.isCurrent, true))
    .all();
  await db.update(deckVersions).set({ isCurrent: false }).run();
  for (const dv of previouslyCurrent) {
    if (dv.id === id) continue;
    await logAudit(actorUserId, "deck_versions", dv.id, "update", {
      ...dv,
      isCurrent: false,
    });
  }
  const row = await db
    .update(deckVersions)
    .set({ isCurrent: true })
    .where(eq(deckVersions.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "deck_versions", row.id, "update", row);
  return row ?? null;
}

/**
 * Companies whose most recent deck-bearing touchpoint referenced a deck version
 * that is NOT the current one - i.e. they last saw an outdated deck.
 */
export async function companiesOnOutdatedDeck(): Promise<OutdatedDeckCompany[]> {
  const current = await db
    .select()
    .from(deckVersions)
    .where(eq(deckVersions.isCurrent, true))
    .get();
  if (!current) return [];

  const latestDeckTouch = db
    .select({
      companyId: touchpoints.companyId,
      lastAt: sql<string>`max(${touchpoints.occurredAt})`.as("last_at"),
    })
    .from(touchpoints)
    .where(sql`${touchpoints.deckVersionId} is not null`)
    .groupBy(touchpoints.companyId)
    .as("latest_deck_touch");

  const rows = await db
    .select({
      company: companies,
      deckVersion: deckVersions,
      sharedAt: touchpoints.occurredAt,
    })
    .from(touchpoints)
    .innerJoin(
      latestDeckTouch,
      and(
        eq(latestDeckTouch.companyId, touchpoints.companyId),
        eq(latestDeckTouch.lastAt, touchpoints.occurredAt),
      ),
    )
    .innerJoin(companies, eq(companies.id, touchpoints.companyId))
    .innerJoin(deckVersions, eq(deckVersions.id, touchpoints.deckVersionId))
    .where(sql`${touchpoints.deckVersionId} <> ${current.id}`)
    .all();

  return rows.map((r) => ({
    company: r.company,
    lastDeckVersion: r.deckVersion,
    lastSharedAt: r.sharedAt,
  }));
}

// ===========================================================================
// Tiers
// ===========================================================================

export async function listTiers(activeOnly = false): Promise<Tier[]> {
  return await db
    .select()
    .from(tiers)
    .where(activeOnly ? eq(tiers.active, true) : undefined)
    .orderBy(tiers.position, tiers.price)
    .all();
}

export interface CreateTierInput {
  name: string;
  price: number;
  description?: string | null;
  position?: number;
  active?: boolean;
  packageLabel?: string | null;
}

export async function createTier(
  input: CreateTierInput,
  actorUserId: number | null = null,
): Promise<Tier> {
  const row = await db
    .insert(tiers)
    .values({
      name: input.name,
      price: input.price,
      description: input.description ?? null,
      position: input.position ?? 0,
      active: input.active ?? true,
      packageLabel: input.packageLabel ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "tiers", row.id, "insert", row);
  return row;
}

export interface UpdateTierInput {
  name?: string;
  price?: number;
  description?: string | null;
  position?: number;
  active?: boolean;
  packageLabel?: string | null;
}

export async function updateTier(
  id: number,
  input: UpdateTierInput,
  actorUserId: number | null = null,
): Promise<Tier | null> {
  const row = await db
    .update(tiers)
    .set(input)
    .where(eq(tiers.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "tiers", row.id, "update", row);
  return row ?? null;
}

// ===========================================================================
// Add-ons
// ===========================================================================

export async function listAddons(): Promise<Addon[]> {
  return await db.select().from(addons).orderBy(addons.name).all();
}

export interface CreateAddonInput {
  name: string;
  description?: string | null;
  priceNote?: string | null;
}

export async function createAddon(
  input: CreateAddonInput,
  actorUserId: number | null = null,
): Promise<Addon> {
  const row = await db
    .insert(addons)
    .values({
      name: input.name,
      description: input.description ?? null,
      priceNote: input.priceNote ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "addons", row.id, "insert", row);
  return row;
}

export interface UpdateAddonInput {
  name?: string;
  description?: string | null;
  priceNote?: string | null;
}

export async function updateAddon(
  id: number,
  input: UpdateAddonInput,
  actorUserId: number | null = null,
): Promise<Addon | null> {
  const row = await db
    .update(addons)
    .set(input)
    .where(eq(addons.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "addons", row.id, "update", row);
  return row ?? null;
}

/** Replace the set of add-ons attached to a deal with exactly `addonIds`. */
export async function setDealAddons(
  dealId: number,
  addonIds: number[],
  actorUserId: number | null = null,
): Promise<void> {
  const existing = await db
    .select()
    .from(dealAddons)
    .where(eq(dealAddons.dealId, dealId))
    .all();
  await db.delete(dealAddons).where(eq(dealAddons.dealId, dealId)).run();
  for (const da of existing) {
    await logAudit(
      actorUserId,
      "deal_addons",
      `${da.dealId}:${da.addonId}`,
      "delete",
      da,
    );
  }
  if (addonIds.length) {
    const inserted = await db.insert(dealAddons)
      .values(addonIds.map((addonId) => ({ dealId, addonId })))
      .returning()
      .all();
    for (const da of inserted) {
      await logAudit(
        actorUserId,
        "deal_addons",
        `${da.dealId}:${da.addonId}`,
        "insert",
        da,
      );
    }
  }
}

/** Add-ons currently attached to a deal. */
export async function getDealAddons(dealId: number): Promise<Addon[]> {
  const rows = await db
    .select({ addon: addons })
    .from(dealAddons)
    .innerJoin(addons, eq(dealAddons.addonId, addons.id))
    .where(eq(dealAddons.dealId, dealId))
    .all();
  return rows.map((r) => r.addon);
}

// ===========================================================================
// Templates
// ===========================================================================

export async function listTemplates(): Promise<Template[]> {
  return await db.select().from(templates).orderBy(templates.name).all();
}

export async function getTemplate(id: number): Promise<Template | null> {
  return await db.select().from(templates).where(eq(templates.id, id)).get() ?? null;
}

export interface CreateTemplateInput {
  name: string;
  scenario?: string | null;
  subject?: string | null;
  body: string;
}

export async function createTemplate(
  input: CreateTemplateInput,
  actorUserId: number | null = null,
): Promise<Template> {
  const now = nowIso();
  const row = await db
    .insert(templates)
    .values({
      name: input.name,
      scenario: input.scenario ?? null,
      subject: input.subject ?? null,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "templates", row.id, "insert", row);
  return row;
}

export interface UpdateTemplateInput {
  name?: string;
  scenario?: string | null;
  subject?: string | null;
  body?: string;
}

export async function updateTemplate(
  id: number,
  input: UpdateTemplateInput,
  actorUserId: number | null = null,
): Promise<Template | null> {
  const row = await db
    .update(templates)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(templates.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "templates", row.id, "update", row);
  return row ?? null;
}

export async function deleteTemplate(
  id: number,
  actorUserId: number | null = null,
): Promise<void> {
  const before = await db.select().from(templates).where(eq(templates.id, id)).get();
  await db.delete(templates).where(eq(templates.id, id)).run();
  await logAudit(actorUserId, "templates", id, "delete", before ?? null);
}

/**
 * Default window (in days) after an outbound, template-cited touch within which
 * an inbound touch on the same company counts as a response to that template.
 */
export const TEMPLATE_RESPONSE_WINDOW_DAYS = 14;

export interface TemplateResponseRate {
  templateId: number;
  templateName: string;
  scenario: string | null;
  /** outbound touchpoints that cited this template */
  sends: number;
  /** of those, how many were followed by an inbound touch within the window */
  responses: number;
  /** responses / sends, 0 when there were no sends */
  responseRate: number;
}

/**
 * Per-template response-rate attribution. For each template, counts the outbound
 * touchpoints that cited it (sends) and the share of those sends that earned an
 * inbound touch on the SAME company within `windowDays` after the send
 * (responses). This turns template choice into an A/B decision instead of
 * folklore. Templates that were never cited on an outbound touch are omitted.
 */
export async function templateResponseRates(
  windowDays = TEMPLATE_RESPONSE_WINDOW_DAYS,
): Promise<TemplateResponseRate[]> {
  // All outbound sends that cited a template, with company + time.
  const sends = await db
    .select({
      templateId: touchpoints.templateId,
      companyId: touchpoints.companyId,
      occurredAt: touchpoints.occurredAt,
    })
    .from(touchpoints)
    .where(
      and(
        eq(touchpoints.direction, "outbound"),
        sql`${touchpoints.templateId} is not null`,
      ),
    )
    .all();

  if (sends.length === 0) return [];

  // Inbound touches per company, sorted, so we can binary-ish scan for a reply
  // in the window after each send. The volume here is small (single-user CRM),
  // so a straightforward per-company array scan is more than fast enough.
  const inboundByCompany = new Map<number, number[]>();
  const inbounds = await db
    .select({
      companyId: touchpoints.companyId,
      occurredAt: touchpoints.occurredAt,
    })
    .from(touchpoints)
    .where(eq(touchpoints.direction, "inbound"))
    .all();
  for (const t of inbounds) {
    const ms = new Date(t.occurredAt).getTime();
    if (!Number.isFinite(ms)) continue;
    const arr = inboundByCompany.get(t.companyId) ?? [];
    arr.push(ms);
    inboundByCompany.set(t.companyId, arr);
  }

  const allTemplates = await db
    .select()
    .from(templates)
    .all();
  const templateName = new Map<number, Template>(
    allTemplates.map((t) => [t.id, t]),
  );

  const windowMs = windowDays * 86_400_000;
  const agg = new Map<number, { sends: number; responses: number }>();
  for (const s of sends) {
    if (s.templateId == null) continue;
    const sendMs = new Date(s.occurredAt).getTime();
    const entry = agg.get(s.templateId) ?? { sends: 0, responses: 0 };
    entry.sends += 1;
    const replies = inboundByCompany.get(s.companyId) ?? [];
    const responded = replies.some(
      (r) => r > sendMs && r - sendMs <= windowMs,
    );
    if (responded) entry.responses += 1;
    agg.set(s.templateId, entry);
  }

  return Array.from(agg.entries())
    .map(([templateId, v]) => {
      const tpl = templateName.get(templateId);
      return {
        templateId,
        templateName: tpl?.name ?? `Template #${templateId}`,
        scenario: tpl?.scenario ?? null,
        sends: v.sends,
        responses: v.responses,
        responseRate: v.sends > 0 ? v.responses / v.sends : 0,
      };
    })
    .sort(
      (a, b) => b.responseRate - a.responseRate || b.sends - a.sends,
    );
}

/**
 * Fallback signer identity for merge fields, used until someone sets
 * `your_name` in Settings -> General.
 */
export const DEFAULT_SENDER_NAME = "Your Name";

/**
 * Fallback organization name, used until someone sets `org_name` in
 * Settings -> General. Appears in outreach copy, proposals, and recaps.
 */
export const DEFAULT_ORG_NAME = "Your Org";

export interface RenderedTemplate {
  subject: string;
  body: string;
}

/**
 * Neutral filler for {{tier_name}} when no specific tier can be resolved, so a
 * template reads "our sponsorship" rather than "the  tier". Keeps a renewal or
 * cold email sensible before a tier has been chosen.
 */
export const NEUTRAL_TIER_NAME = "sponsorship";

/**
 * Resolve the target tier for a company/deal, deal- and cycle-aware:
 *  1. If dealId is given, use that exact deal's target tier.
 *  2. Otherwise prefer the newest deal in the current cycle; only if the current
 *     cycle has no deal at all do we fall back to the company's newest deal.
 * A deal with no target tier resolves to null (the neutral filler is applied by
 * callers) rather than leaking an older/other-cycle deal's tier (the renewal
 * bug). Returns the resolved tier row, or null when none applies.
 */
async function resolveTargetTier(companyId: number, dealId?: number): Promise<Tier | null> {
  const tierFor = async (targetTierId: number | null): Promise<Tier | null> => {
    if (targetTierId == null) return null;
    return (await db.select().from(tiers).where(eq(tiers.id, targetTierId)).get()) ?? null;
  };

  if (dealId != null) {
    const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
    if (deal && deal.companyId === companyId) return await tierFor(deal.targetTierId);
  }

  const companyDeals = await db
    .select()
    .from(deals)
    .where(eq(deals.companyId, companyId))
    .orderBy(desc(deals.createdAt))
    .all();
  if (companyDeals.length === 0) return null;

  const currentCycle = await getCurrentCycle();
  const inCycle = companyDeals.filter((d) => d.cycle === currentCycle);
  const chosen = (inCycle.length ? inCycle : companyDeals)[0];
  return await tierFor(chosen.targetTierId);
}

/**
 * Stages that count a company as a live, provable sponsor for proof-point copy:
 * committed, fulfilling, or renewed in the current cycle. Kept in sync with
 * COMMITTED_STAGES (defined later for the revenue rollup).
 */
const SPONSOR_PROOF_STAGES: readonly DealStage[] = [
  "committed",
  "fulfilling",
  "renewed",
] as const;

/**
 * Distinct company names that are committed/fulfilling/renewed in the current
 * cycle, in alphabetical order - the peer-org proof used by {{current_sponsors}}
 * when no settings override is present.
 */
export async function listCurrentSponsorNames(): Promise<string[]> {
  const cycle = await getCurrentCycle();
  const rows = await db
    .select({ name: companies.name })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .where(
      and(
        eq(deals.cycle, cycle),
        inArray(deals.stage, SPONSOR_PROOF_STAGES as DealStage[]),
      ),
    )
    .all();
  const names = [...new Set(rows.map((r) => r.name))];
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/**
 * Human-readable {{current_sponsors}} value: the `current_sponsors` settings
 * override when set, otherwise a natural-language list computed from the live
 * committed/fulfilling/renewed deals ("Cobalt Energy and Meridian Labs"), and an empty
 * string when there are none.
 */
export async function resolveCurrentSponsors(): Promise<string> {
  const override = await getSetting("current_sponsors");
  if (override && override.trim()) return override.trim();

  const names = await listCurrentSponsorNames();
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * The anchor event label for {{anchor_event}}: the `anchor_event` settings
 * override when set, otherwise the active cycle's anchorEvent, otherwise "".
 */
export async function resolveAnchorEvent(): Promise<string> {
  const override = await getSetting("anchor_event");
  if (override && override.trim()) return override.trim();
  const active = await getActiveCycle();
  return active?.anchorEvent?.trim() ?? "";
}

/**
 * Render a template, substituting merge fields:
 *   {{company}}, {{contact_name}}, {{contact_first_name}},
 *   {{tier_name}}, {{tier_price}}, {{your_name}},
 *   {{member_count}}, {{hackathon_reach}}, {{current_sponsors}}, {{anchor_event}},
 *   {{fit_notes}}, {{personalization_hook}}, {{deck_link}},
 *   {{days_to_event}}, {{event_date}}
 * Unknown/unavailable fields render as empty strings. {{tier_name}} and
 * {{tier_price}} are resolved deal-aware (when dealId is given) and cycle-aware,
 * falling back to a neutral word / empty rather than an unrelated deal's tier.
 * The proof-point fields come from settings, with {{current_sponsors}} computed
 * from live committed deals (settings override wins) and {{anchor_event}} from
 * the active cycle (settings override wins).
 */
export async function renderTemplate(
  templateId: number,
  companyId: number,
  contactId?: number,
  dealId?: number,
): Promise<RenderedTemplate | null> {
  const template = await getTemplate(templateId);
  if (!template) return null;

  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();

  const contact = contactId
    ? await db.select().from(contacts).where(eq(contacts.id, contactId)).get()
    : undefined;

  const contactName = contact?.name ?? "";
  const contactFirstName = contactName.split(/\s+/)[0] ?? "";

  const tier = await resolveTargetTier(companyId, dealId);

  const activeCycleAnchor = await getActiveCycleAnchor();

  const values: Record<string, string> = {
    company: company?.name ?? "",
    contact_name: contactName,
    contact_first_name: contactFirstName,
    tier_name: tier?.name ?? NEUTRAL_TIER_NAME,
    tier_price: tier ? `$${tier.price.toLocaleString("en-US")}` : "",
    your_name: (await getSetting("your_name")) ?? DEFAULT_SENDER_NAME,
    org_name: (await getSetting("org_name"))?.trim() || DEFAULT_ORG_NAME,
    member_count: (await getSetting("member_count")) ?? "",
    hackathon_reach: (await getSetting("hackathon_reach")) ?? "",
    current_sponsors: await resolveCurrentSponsors(),
    anchor_event: await resolveAnchorEvent(),
    fit_notes: company?.fitNotes?.trim() ?? "",
    personalization_hook: await computePersonalizationHook(companyId),
    deck_link: await getCurrentDeckLink(),
    days_to_event: (() => {
      const { daysRemaining } = activeCycleAnchor;
      return daysRemaining != null && daysRemaining >= 0 ? String(daysRemaining) : "";
    })(),
    event_date: (() => {
      const { anchorEventDate } = activeCycleAnchor;
      if (!anchorEventDate) return "";
      const d = new Date(`${anchorEventDate}T00:00:00`);
      return Number.isNaN(d.getTime())
        ? anchorEventDate
        : d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
    })(),
  };

  const substitute = (input: string): string =>
    input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
      key in values ? values[key] : "",
    );

  return {
    subject: substitute(template.subject ?? ""),
    body: substitute(template.body),
  };
}

/**
 * Render a template into a ready-to-send message for one-click compose: the
 * rendered subject/body plus the chosen contact's email as the recipient. When
 * no contactId is given (or that contact has no email), `to` is null and the
 * caller can still open a subject/body-only draft. Returns null only when the
 * template itself cannot be rendered.
 */
export async function composeMessage(
  templateId: number,
  companyId: number,
  contactId?: number,
  dealId?: number,
): Promise<{ to: string | null; subject: string; body: string } | null> {
  const rendered = await renderTemplate(templateId, companyId, contactId, dealId);
  if (!rendered) return null;

  let to: string | null = null;
  if (contactId != null) {
    const contact = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .get();
    to = contact?.email ?? null;
  }

  return { to, subject: rendered.subject, body: rendered.body };
}

/**
 * Resolve one-click-compose context for an open next action, when there is a
 * template to render. Used by the Today view to put a Gmail-compose button on
 * cadence-created due actions.
 *
 * A cadence-created action was scheduled from the step at cadenceStepIndex - 1
 * (advanceCadenceAfterTouchpoint schedules a step, then advances the index past
 * it), so that step's template is the one to render. The recipient is the
 * company's first contact that has an email on file. Returns null when the
 * action's deal has no cadence, the resolved step has no template, or the
 * template cannot be rendered - i.e. when there is nothing to compose.
 */
export async function composeForAction(
  actionId: number,
): Promise<{ to: string | null; subject: string; body: string } | null> {
  const action = await db
    .select()
    .from(nextActions)
    .where(eq(nextActions.id, actionId))
    .get();
  if (!action) return null;

  const deal = await db.select().from(deals).where(eq(deals.id, action.dealId)).get();
  if (!deal || deal.cadenceId == null) return null;

  const steps = await db
    .select()
    .from(cadenceSteps)
    .where(eq(cadenceSteps.cadenceId, deal.cadenceId))
    .orderBy(asc(cadenceSteps.position))
    .all();
  // The open cadence action came from the step just before the current index.
  const step = steps[deal.cadenceStepIndex - 1];
  if (!step || step.templateId == null) return null;

  const companyContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, deal.companyId))
    .all();
  const contact = companyContacts.find((c) => c.email) ?? null;

  return await composeMessage(
    step.templateId,
    deal.companyId,
    contact?.id ?? undefined,
    deal.id,
  );
}

// ===========================================================================
// Cadences
// ===========================================================================

export async function listCadences(): Promise<CadenceWithSteps[]> {
  const allCadences = await db.select().from(cadences).orderBy(cadences.name).all();
  const allSteps = await db
    .select()
    .from(cadenceSteps)
    .orderBy(cadenceSteps.cadenceId, cadenceSteps.position)
    .all();
  return allCadences.map((c) => ({
    ...c,
    steps: allSteps.filter((s) => s.cadenceId === c.id),
  }));
}

export interface CreateCadenceInput {
  name: string;
  description?: string | null;
}

export async function createCadence(
  input: CreateCadenceInput,
  actorUserId: number | null = null,
): Promise<Cadence> {
  const row = await db
    .insert(cadences)
    .values({ name: input.name, description: input.description ?? null })
    .returning()
    .get();
  await logAudit(actorUserId, "cadences", row.id, "insert", row);
  return row;
}

export interface UpdateCadenceInput {
  name?: string;
  description?: string | null;
}

export async function updateCadence(
  id: number,
  input: UpdateCadenceInput,
  actorUserId: number | null = null,
): Promise<Cadence | null> {
  const row = await db
    .update(cadences)
    .set(input)
    .where(eq(cadences.id, id))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "cadences", row.id, "update", row);
  return row ?? null;
}

export interface CadenceStepInput {
  position: number;
  waitDays: number;
  channel: TouchpointChannel;
  templateId?: number | null;
  note?: string | null;
}

/** Replace a cadence's steps with exactly the provided ordered steps. */
export async function setCadenceSteps(
  cadenceId: number,
  steps: CadenceStepInput[],
  actorUserId: number | null = null,
): Promise<CadenceStep[]> {
  const existing = await db
    .select()
    .from(cadenceSteps)
    .where(eq(cadenceSteps.cadenceId, cadenceId))
    .all();
  await db.delete(cadenceSteps).where(eq(cadenceSteps.cadenceId, cadenceId)).run();
  for (const s of existing) {
    await logAudit(actorUserId, "cadence_steps", s.id, "delete", s);
  }
  if (!steps.length) return [];
  const inserted = await db
    .insert(cadenceSteps)
    .values(
      steps.map((s) => ({
        cadenceId,
        position: s.position,
        waitDays: s.waitDays,
        channel: s.channel,
        templateId: s.templateId ?? null,
        note: s.note ?? null,
      })),
    )
    .returning()
    .all();
  for (const s of inserted) {
    await logAudit(actorUserId, "cadence_steps", s.id, "insert", s);
  }
  return inserted;
}

/** Assign (or clear, with null) a cadence to a deal, resetting the step index. */
export async function assignCadenceToDeal(
  dealId: number,
  cadenceId: number | null,
  actorUserId: number | null = null,
): Promise<Deal | null> {
  const row = await db
    .update(deals)
    .set({ cadenceId, cadenceStepIndex: 0 })
    .where(eq(deals.id, dealId))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "deals", row.id, "update", row);
  return row ?? null;
}

// ===========================================================================
// Settings (single-user key/value store)
// ===========================================================================

/** Read a single setting value, or null when the key is absent. */
export async function getSetting(key: string): Promise<string | null> {
  const row = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? null;
}

/** Upsert a single setting value. */
export async function setSetting(
  key: string,
  value: string,
  actorUserId: number | null = null,
): Promise<void> {
  const existed = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  await db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
  await logAudit(
    actorUserId,
    "settings",
    key,
    existed ? "update" : "insert",
    { key, value },
  );
}

/** All settings as a plain key -> value map. */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings).all();
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.value != null) out[r.key] = r.value;
  }
  return out;
}

// ===========================================================================
// Cycles
// ===========================================================================

export async function listCycles(): Promise<Cycle[]> {
  return await db.select().from(cycles).orderBy(desc(cycles.label)).all();
}

/** The single active cycle, or null when none is marked active. */
export async function getActiveCycle(): Promise<Cycle | null> {
  return await db.select().from(cycles).where(eq(cycles.isActive, true)).get() ?? null;
}

export interface CreateCycleInput {
  label: string;
  anchorEvent?: string | null;
  /** ISO date (YYYY-MM-DD) of the anchor event */
  anchorEventDate?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  isActive?: boolean;
}

export async function createCycle(
  input: CreateCycleInput,
  actorUserId: number | null = null,
): Promise<Cycle> {
  const row = await db
    .insert(cycles)
    .values({
      label: input.label,
      anchorEvent: input.anchorEvent ?? null,
      anchorEventDate: input.anchorEventDate ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      isActive: input.isActive ?? false,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "cycles", row.id, "insert", row);
  if (row.isActive) await setActiveCycle(row.id, actorUserId);
  return row;
}

export interface UpdateCycleInput {
  label?: string;
  anchorEvent?: string | null;
  /** ISO date (YYYY-MM-DD) of the anchor event */
  anchorEventDate?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  isActive?: boolean;
}

export async function updateCycle(
  id: number,
  input: UpdateCycleInput,
  actorUserId: number | null = null,
): Promise<Cycle | null> {
  const { isActive, ...rest } = input;
  const row = await db
    .update(cycles)
    .set(rest)
    .where(eq(cycles.id, id))
    .returning()
    .get();
  if (!row) return null;
  await logAudit(actorUserId, "cycles", row.id, "update", row);
  if (isActive === true) return await setActiveCycle(id, actorUserId);
  return row;
}

/**
 * Mark one cycle active, clear the flag on all others, and persist its label as
 * the `current_cycle` setting so getCurrentCycle() follows the active cycle.
 */
export async function setActiveCycle(
  id: number,
  actorUserId: number | null = null,
): Promise<Cycle | null> {
  const previouslyActive = await db
    .select()
    .from(cycles)
    .where(eq(cycles.isActive, true))
    .all();
  await db.update(cycles).set({ isActive: false }).run();
  for (const c of previouslyActive) {
    if (c.id === id) continue;
    await logAudit(actorUserId, "cycles", c.id, "update", { ...c, isActive: false });
  }
  const row = await db
    .update(cycles)
    .set({ isActive: true })
    .where(eq(cycles.id, id))
    .returning()
    .get();
  if (!row) return null;
  await logAudit(actorUserId, "cycles", row.id, "update", row);
  await setSetting("current_cycle", row.label, actorUserId);
  return row;
}

/**
 * Anchor-event context for the active cycle, used by the countdown banner and
 * the {{days_to_event}} / {{event_date}} merge fields. `daysRemaining` is the
 * calendar-day count from today to the anchor date (0 = today, negative = past),
 * or null when no anchor date is set. `anchorEvent` / `anchorEventDate` are null
 * when unset or when there is no active cycle.
 */
export interface ActiveCycleAnchor {
  anchorEvent: string | null;
  anchorEventDate: string | null;
  daysRemaining: number | null;
}

export async function getActiveCycleAnchor(): Promise<ActiveCycleAnchor> {
  const active = await getActiveCycle();
  const anchorEvent = active?.anchorEvent?.trim() || null;
  const anchorEventDate = active?.anchorEventDate?.trim() || null;

  let daysRemaining: number | null = null;
  if (anchorEventDate) {
    const target = new Date(`${anchorEventDate}T00:00:00`);
    if (!Number.isNaN(target.getTime())) {
      daysRemaining = differenceInCalendarDays(target, new Date());
    }
  }
  return { anchorEvent, anchorEventDate, daysRemaining };
}

/**
 * Minimum days needed to realistically close a deal from each active stage, used
 * to flag "tight on time" when the anchor-event runway is shorter. Earlier
 * stages need more runway (a fresh prospect must go through outreach, a
 * conversation, a pitch, and a negotiation); late stages need little. Committed+
 * stages are omitted (already closed - no ask deadline pressure).
 */
export const STAGE_MIN_DAYS_TO_CLOSE: Readonly<
  Partial<Record<DealStage, number>>
> = {
  prospect: 45,
  outreach: 35,
  conversation: 25,
  pitched: 14,
  negotiating: 7,
} as const;

/**
 * True when a deal at `stage` cannot realistically close before the anchor event
 * given `daysRemaining` of runway - i.e. the remaining runway is below the
 * stage's minimum days-to-close. False for committed+ stages, when no runway is
 * known, or when there is comfortably enough time.
 */
export function isTightOnTime(
  stage: DealStage,
  daysRemaining: number | null,
): boolean {
  if (daysRemaining == null) return false;
  const min = STAGE_MIN_DAYS_TO_CLOSE[stage];
  if (min == null) return false;
  return daysRemaining < min;
}

/**
 * Whether a rollover candidate is a renewal (a signed sponsor to renew) or a
 * reapproach (a warm company that engaged but did not close, worth trying again
 * next cycle). Both roll into the target cycle; they are surfaced distinctly.
 */
export type RolloverKind = "renewal" | "reapproach";

/** Summary of what rolloverCycle created. */
export interface RolloverSummary {
  fromLabel: string;
  toLabel: string;
  /** deals created in the target cycle, with the company + which kind they are */
  created: Array<{
    companyId: number;
    companyName: string;
    dealId: number;
    kind: RolloverKind;
  }>;
  /** companies skipped because they already had a deal in the target cycle */
  skipped: Array<{ companyId: number; companyName: string; kind: RolloverKind }>;
}

/** Deal stages that qualify a company for renewal rollover (signed sponsors). */
const RENEWABLE_STAGES: readonly DealStage[] = [
  "committed",
  "fulfilling",
  "renewed",
] as const;

/**
 * Deal stages that qualify a company as a warm re-approach next cycle: it got
 * into a real conversation, a pitch, or a negotiation, or lapsed after engaging.
 * These are distinct from renewals (signed) and from cold prospects (never
 * engaged) - the warm cohort worth trying again.
 */
const REAPPROACHABLE_STAGES: readonly DealStage[] = [
  "conversation",
  "pitched",
  "negotiating",
  "lapsed",
] as const;

/** One rollover source deal resolved against the target cycle. */
interface RolloverCandidate {
  companyId: number;
  companyName: string;
  sourceStage: DealStage;
  sourceTargetTierId: number | null;
  /** structured loss reason on the source deal, carried into the new deal */
  sourceLostReason: DealLostReason | null;
  /** sponsor-satisfaction on the source deal, used to order the renewal preview */
  sourceSatisfaction: DealSatisfaction | null;
  /** champion contact on the source deal, carried into the new deal */
  sourceChampionContactId: number | null;
  /** renewal (signed sponsor) vs reapproach (warm, did not close) */
  kind: RolloverKind;
  /** true when the company already has a deal in the target cycle */
  alreadyInTarget: boolean;
}

/**
 * Resolve, per company, the single rollover source deal in `fromLabel` and
 * whether that company already has a deal in `toLabel`. This is the shared
 * selection core used by BOTH previewRollover (dry-run) and rolloverCycle
 * (execution) so the preview always matches what execution will do.
 *
 * Two cohorts roll forward: RENEWABLE_STAGES (signed sponsors -> 'renewal') and
 * REAPPROACHABLE_STAGES (warm companies that engaged but did not close ->
 * 'reapproach'). A company that qualifies for both is resolved as a renewal (the
 * stronger relationship), so the reapproach path never masks a renewal.
 */
async function resolveRolloverCandidates(
  fromLabel: string,
  toLabel: string,
): Promise<RolloverCandidate[]> {
  if (!fromLabel || !toLabel || fromLabel === toLabel) return [];

  const sourceDeals = await db
    .select({ deal: deals, company: companies })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .where(
      and(
        eq(deals.cycle, fromLabel),
        inArray(deals.stage, [
          ...RENEWABLE_STAGES,
          ...REAPPROACHABLE_STAGES,
        ] as DealStage[]),
      ),
    )
    .orderBy(companies.name)
    .all();

  // Companies that already have a deal in the target cycle.
  const existingTargetRows = await db
    .select({ companyId: deals.companyId })
    .from(deals)
    .where(eq(deals.cycle, toLabel))
    .all();
  const existingTargets = new Set(existingTargetRows.map((r) => r.companyId));

  const renewableStages = new Set<string>(RENEWABLE_STAGES);

  // Resolve one candidate per company. A renewal always wins over a reapproach
  // when a company has qualifying deals in both cohorts.
  const byCompany = new Map<number, RolloverCandidate>();
  for (const { deal, company } of sourceDeals) {
    const kind: RolloverKind = renewableStages.has(deal.stage)
      ? "renewal"
      : "reapproach";
    const existing = byCompany.get(company.id);
    if (existing && (existing.kind === "renewal" || kind === "reapproach")) {
      // Keep the already-chosen candidate unless we now found a renewal that
      // should supersede a previously-chosen reapproach.
      continue;
    }
    byCompany.set(company.id, {
      companyId: company.id,
      companyName: company.name,
      sourceStage: deal.stage as DealStage,
      sourceTargetTierId: deal.targetTierId,
      sourceLostReason: normalizeDealLostReason(deal.lostReason),
      sourceSatisfaction: normalizeDealSatisfaction(deal.satisfaction),
      sourceChampionContactId: deal.championContactId,
      kind,
      alreadyInTarget: existingTargets.has(company.id),
    });
  }

  // Renewals first, then by satisfaction (happy sponsors renew easiest and
  // should lead the queue), then alphabetically. Reapproaches keep name order.
  const satRank = (s: DealSatisfaction | null): number =>
    s == null ? DEAL_SATISFACTION_RANK.neutral : DEAL_SATISFACTION_RANK[s];
  return Array.from(byCompany.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "renewal" ? -1 : 1;
    if (a.kind === "renewal") {
      const bySat = satRank(a.sourceSatisfaction) - satRank(b.sourceSatisfaction);
      if (bySat !== 0) return bySat;
    }
    return a.companyName.localeCompare(b.companyName);
  });
}

/** Dry-run preview of a rollover: what would be created vs skipped. */
export interface RolloverPreview {
  fromLabel: string;
  toLabel: string;
  willCreate: Array<{
    companyId: number;
    companyName: string;
    sourceStage: DealStage;
    kind: RolloverKind;
    /** source-deal satisfaction, so the renewal preview can badge/order it */
    satisfaction: DealSatisfaction | null;
  }>;
  willSkip: Array<{
    companyId: number;
    companyName: string;
    kind: RolloverKind;
  }>;
}

/**
 * Dry-run of rolloverCycle(fromLabel, toLabel): resolves which companies would
 * get a fresh renewal/reapproach deal versus be skipped, without writing
 * anything. Shares resolveRolloverCandidates() with rolloverCycle so the preview
 * always matches execution.
 */
export async function previewRollover(
  fromLabel: string,
  toLabel: string,
): Promise<RolloverPreview> {
  const preview: RolloverPreview = {
    fromLabel,
    toLabel,
    willCreate: [],
    willSkip: [],
  };
  for (const c of await resolveRolloverCandidates(fromLabel, toLabel)) {
    if (c.alreadyInTarget) {
      preview.willSkip.push({
        companyId: c.companyId,
        companyName: c.companyName,
        kind: c.kind,
      });
    } else {
      preview.willCreate.push({
        companyId: c.companyId,
        companyName: c.companyName,
        sourceStage: c.sourceStage,
        kind: c.kind,
        satisfaction: c.sourceSatisfaction,
      });
    }
  }
  return preview;
}

/**
 * Seed a new cycle from a prior one. Two cohorts roll forward:
 *   - Renewals: companies whose deal reached committed/fulfilling/renewed. The
 *     new deal is noted "Renewal - was <stage> in <fromLabel>" with a "Reach out
 *     for renewal" next action.
 *   - Reapproaches: warm companies that engaged (conversation/pitched/negotiating
 *     or lapsed) but did not sign. The new deal is noted "Re-approach - was
 *     <stage> in <fromLabel>" with a "Re-approach this cycle" next action.
 * Both create a fresh prospect-stage deal in `toLabel` (carrying the prior target
 * tier) with an open next action due 14 days out. Companies that already have any
 * deal in `toLabel` are skipped. Returns a summary tagging each by kind.
 */
export async function rolloverCycle(
  fromLabel: string,
  toLabel: string,
  actorUserId: number | null = null,
): Promise<RolloverSummary> {
  const summary: RolloverSummary = {
    fromLabel,
    toLabel,
    created: [],
    skipped: [],
  };

  const dueDate = formatISO(addDays(new Date(), 14), { representation: "date" });

  for (const c of await resolveRolloverCandidates(fromLabel, toLabel)) {
    if (c.alreadyInTarget) {
      summary.skipped.push({
        companyId: c.companyId,
        companyName: c.companyName,
        kind: c.kind,
      });
      continue;
    }

    const isRenewal = c.kind === "renewal";
    const notePrefix = isRenewal ? "Renewal" : "Re-approach";
    // Carry the prior loss reason into the note so the successor sees why it did
    // not close last cycle, not just that it did not.
    const lostPart =
      !isRenewal && c.sourceLostReason
        ? `, lost on ${DEAL_LOST_REASON_LABEL[c.sourceLostReason].toLowerCase()}`
        : "";
    const newDeal = await createDeal(
      {
        companyId: c.companyId,
        cycle: toLabel,
        stage: "prospect",
        // Carry forward the prior tier, loss reason, and champion so the new-cycle
        // deal keeps its structured history rather than only a free-text note.
        targetTierId: c.sourceTargetTierId,
        lostReason: c.sourceLostReason,
        championContactId: c.sourceChampionContactId,
        customTerms: `${notePrefix} - was ${c.sourceStage} in ${fromLabel}${lostPart}`,
      },
      actorUserId,
    );

    await createNextAction(
      {
        dealId: newDeal.id,
        title: isRenewal ? "Reach out for renewal" : "Re-approach this cycle",
        dueDate,
        createdBy: "manual",
      },
      actorUserId,
    );

    summary.created.push({
      companyId: c.companyId,
      companyName: c.companyName,
      dealId: newDeal.id,
      kind: c.kind,
    });
  }

  return summary;
}

// ===========================================================================
// Deliverable templates & deal deliverables
// ===========================================================================

export async function listDeliverableTemplates(
  tierId?: number,
): Promise<DeliverableTemplate[]> {
  return await db
    .select()
    .from(deliverableTemplates)
    .where(tierId != null ? eq(deliverableTemplates.tierId, tierId) : undefined)
    .orderBy(deliverableTemplates.tierId, deliverableTemplates.position)
    .all();
}

export interface DeliverableTemplateInput {
  title: string;
  defaultOwner?: string | null;
  position?: number;
}

/**
 * Replace a tier's deliverable-template checklist with exactly `items`, in the
 * order provided (position is assigned by index unless explicitly set).
 */
export async function setTierDeliverableTemplates(
  tierId: number,
  items: DeliverableTemplateInput[],
  actorUserId: number | null = null,
): Promise<DeliverableTemplate[]> {
  const existing = await db
    .select()
    .from(deliverableTemplates)
    .where(eq(deliverableTemplates.tierId, tierId))
    .all();
  await db.delete(deliverableTemplates)
    .where(eq(deliverableTemplates.tierId, tierId))
    .run();
  for (const t of existing) {
    await logAudit(actorUserId, "deliverable_templates", t.id, "delete", t);
  }
  if (!items.length) return [];
  const inserted = await db
    .insert(deliverableTemplates)
    .values(
      items.map((item, i) => ({
        tierId,
        title: item.title,
        defaultOwner: item.defaultOwner ?? null,
        position: item.position ?? i,
      })),
    )
    .returning()
    .all();
  for (const t of inserted) {
    await logAudit(actorUserId, "deliverable_templates", t.id, "insert", t);
  }
  return inserted;
}

/**
 * Instantiate deal deliverables from the deal's target tier's template set.
 * Titles already present on the deal are skipped so it is safe to re-run.
 * Returns the deliverables that were newly created.
 */
export async function generateDealDeliverables(
  dealId: number,
  actorUserId: number | null = null,
): Promise<DealDeliverable[]> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal || deal.targetTierId == null) return [];

  const templatesForTier = await listDeliverableTemplates(deal.targetTierId);
  if (!templatesForTier.length) return [];

  const existingTitleRows = await db
    .select({ title: dealDeliverables.title })
    .from(dealDeliverables)
    .where(eq(dealDeliverables.dealId, dealId))
    .all();
  const existingTitles = new Set(existingTitleRows.map((r) => r.title));

  const toCreate = templatesForTier.filter((t) => !existingTitles.has(t.title));
  if (!toCreate.length) return [];

  const now = nowIso();
  const inserted = await db
    .insert(dealDeliverables)
    .values(
      toCreate.map((t) => ({
        dealId,
        title: t.title,
        owner: t.defaultOwner ?? null,
        dueDate: null,
        status: "open" as DeliverableStatus,
        note: null,
        createdAt: now,
      })),
    )
    .returning()
    .all();
  for (const d of inserted) {
    await logAudit(actorUserId, "deal_deliverables", d.id, "insert", d);
  }
  return inserted;
}

export async function listDealDeliverables(dealId: number): Promise<DealDeliverable[]> {
  return await db
    .select()
    .from(dealDeliverables)
    .where(eq(dealDeliverables.dealId, dealId))
    .orderBy(dealDeliverables.createdAt)
    .all();
}

/** A deliverable joined with its deal + company, for the Fulfillment view. */
export interface DeliverableWithContext extends DealDeliverable {
  deal: Deal;
  company: Company;
}

/** Every non-done deliverable across all deals, joined with its company. */
export async function listAllOpenDeliverables(): Promise<DeliverableWithContext[]> {
  const rows = await db
    .select({
      deliverable: dealDeliverables,
      deal: deals,
      company: companies,
    })
    .from(dealDeliverables)
    .innerJoin(deals, eq(dealDeliverables.dealId, deals.id))
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .where(inArray(dealDeliverables.status, ["open", "blocked"]))
    .orderBy(companies.name, dealDeliverables.dueDate)
    .all();
  return rows.map((r) => ({
    ...r.deliverable,
    deal: r.deal,
    company: r.company,
  }));
}

export interface CreateDealDeliverableInput {
  dealId: number;
  title: string;
  owner?: string | null;
  dueDate?: string | null;
  status?: DeliverableStatus;
  note?: string | null;
  proofUrl?: string | null;
  metricValue?: string | null;
}

export async function createDealDeliverable(
  input: CreateDealDeliverableInput,
  actorUserId: number | null = null,
): Promise<DealDeliverable> {
  const now = nowIso();
  const isDone = input.status === "done";
  const row = await db
    .insert(dealDeliverables)
    .values({
      dealId: input.dealId,
      title: input.title,
      owner: input.owner ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? "open",
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
      metricValue: input.metricValue ?? null,
      deliveredAt: isDone ? now : null,
      createdAt: now,
      doneAt: isDone ? now : null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "deal_deliverables", row.id, "insert", row);
  return row;
}

export interface UpdateDealDeliverableInput {
  title?: string;
  owner?: string | null;
  dueDate?: string | null;
  status?: DeliverableStatus;
  note?: string | null;
  proofUrl?: string | null;
  metricValue?: string | null;
}

/**
 * Update a deliverable. Transitioning to 'done' stamps doneAt and, the first
 * time it is delivered, deliveredAt (which is NOT cleared when the status later
 * moves away from done - the delivery moment is a fact worth keeping). The proof
 * link and metric are captured verbatim when provided (empty string clears).
 */
export async function updateDealDeliverable(
  id: number,
  input: UpdateDealDeliverableInput,
  actorUserId: number | null = null,
): Promise<DealDeliverable | null> {
  const current = await db
    .select()
    .from(dealDeliverables)
    .where(eq(dealDeliverables.id, id))
    .get();
  if (!current) return null;

  const patch: Partial<DealDeliverable> = { ...input };
  if (input.proofUrl !== undefined) {
    patch.proofUrl = input.proofUrl?.trim() ? input.proofUrl.trim() : null;
  }
  if (input.metricValue !== undefined) {
    patch.metricValue = input.metricValue?.trim()
      ? input.metricValue.trim()
      : null;
  }
  if (input.status && input.status !== current.status) {
    patch.doneAt = input.status === "done" ? nowIso() : null;
    // Stamp deliveredAt on the first flip to done; never clear it afterward.
    if (input.status === "done" && current.deliveredAt == null) {
      patch.deliveredAt = nowIso();
    }
  }

  const row = await db
    .update(dealDeliverables)
    .set(patch)
    .where(eq(dealDeliverables.id, id))
    .returning()
    .get();
  if (row) {
    await logAudit(actorUserId, "deal_deliverables", row.id, "update", row);
  }
  return row ?? null;
}

export async function deleteDealDeliverable(
  id: number,
  actorUserId: number | null = null,
): Promise<void> {
  const before = await db
    .select()
    .from(dealDeliverables)
    .where(eq(dealDeliverables.id, id))
    .get();
  await db.delete(dealDeliverables).where(eq(dealDeliverables.id, id)).run();
  await logAudit(actorUserId, "deal_deliverables", id, "delete", before ?? null);
}

// ===========================================================================
// Sponsor-facing exports (recap)
// ===========================================================================

/**
 * Format an ISO date/timestamp as a plain "Mon D, YYYY" for sponsor-facing copy.
 * Returns "" for a nullish/unparseable value.
 */
function formatSponsorDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Build a sponsor-facing fulfillment recap for one deal, as Markdown. Unlike the
 * internal handoff, this is safe to send to the sponsor: it carries the cycle and
 * anchor event, the tier they bought and its promised benefits (the tier's
 * deliverable templates), each delivered deliverable with its captured metric and
 * proof link, and a thank-you. It deliberately omits internal-only data - no
 * stage, ask amount, loss reason, private notes, or contact warmth. Every full
 * sentence sits on its own line and only plain dashes are used, per convention.
 *
 * Returns null when the deal does not exist.
 */
export async function buildFulfillmentRecap(dealId: number): Promise<string | null> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) return null;

  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, deal.companyId))
    .get();
  if (!company) return null;

  const tier =
    deal.targetTierId != null
      ? await db.select().from(tiers).where(eq(tiers.id, deal.targetTierId)).get() ??
        null
      : null;

  const promised = tier ? await listDeliverableTemplates(tier.id) : [];
  const deliverables = await listDealDeliverables(dealId);
  const delivered = deliverables.filter((d) => d.status === "done");

  const anchorEvent = await resolveAnchorEvent();
  const orgName = (await getSetting("org_name"))?.trim() || DEFAULT_ORG_NAME;

  const lines: string[] = [];

  lines.push(`# ${company.name} sponsorship recap`);
  lines.push("");
  lines.push(
    anchorEvent
      ? `Thank you for sponsoring ${orgName} for ${deal.cycle}, anchored by ${anchorEvent}.`
      : `Thank you for sponsoring ${orgName} for ${deal.cycle}.`,
  );
  lines.push("");

  lines.push("## Your sponsorship");
  lines.push("");
  if (tier) {
    lines.push(`- Tier: ${tier.name}.`);
    if (tier.description) {
      lines.push(`- ${tier.description}`);
    }
  } else {
    lines.push("- A custom sponsorship package.");
  }
  lines.push("");

  lines.push("## What we promised");
  lines.push("");
  if (promised.length === 0) {
    lines.push("- The benefits agreed for this sponsorship.");
  } else {
    for (const p of promised) {
      lines.push(`- ${p.title}`);
    }
  }
  lines.push("");

  lines.push("## What we delivered");
  lines.push("");
  if (delivered.length === 0) {
    lines.push("Delivery is underway - a full accounting follows shortly.");
  } else {
    for (const d of delivered) {
      const metricPart = d.metricValue ? ` - ${d.metricValue}` : "";
      const datePart = d.deliveredAt
        ? ` (delivered ${formatSponsorDate(d.deliveredAt)})`
        : "";
      lines.push(`- ${d.title}${metricPart}${datePart}.`);
      if (d.proofUrl) {
        lines.push(`  - Proof: ${d.proofUrl}`);
      }
    }
  }
  lines.push("");

  lines.push("## Thank you");
  lines.push("");
  lines.push(
    `Your support directly powered our members and ${anchorEvent || "our programming"} this cycle.`,
  );
  lines.push("We would be glad to partner with you again next cycle.");

  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Build a sponsor-facing proposal one-pager for one deal, as Markdown. This is
 * the artifact that gets circulated for budget approval - distinct from both the
 * internal handoff and the fulfillment recap. It leads with proof points from
 * settings (member count, hackathon reach, current sponsors), presents the
 * target tier and its deliverable-template benefits at the tier price, lists any
 * attached a la carte add-ons with their prices, and closes with a clear CTA.
 * It carries no internal-only data (no stage, weighted pipeline, notes, or loss
 * reasons). Every full sentence sits on its own line and only plain dashes are
 * used, per convention.
 *
 * Returns null when the deal does not exist.
 */
export async function buildSponsorProposal(dealId: number): Promise<string | null> {
  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) return null;

  const company = await db
    .select()
    .from(companies)
    .where(eq(companies.id, deal.companyId))
    .get();
  if (!company) return null;

  const tier =
    deal.targetTierId != null
      ? await db.select().from(tiers).where(eq(tiers.id, deal.targetTierId)).get() ??
        null
      : null;
  const benefits = tier ? await listDeliverableTemplates(tier.id) : [];
  const addonRows = await getDealAddons(dealId);

  const orgName = (await getSetting("org_name"))?.trim() || DEFAULT_ORG_NAME;
  const memberCount = (await getSetting("member_count"))?.trim() ?? "";
  const hackathonReach = (await getSetting("hackathon_reach"))?.trim() ?? "";
  const currentSponsors = await resolveCurrentSponsors();
  const anchorEvent = await resolveAnchorEvent();
  const yourName = (await getSetting("your_name")) ?? DEFAULT_SENDER_NAME;
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;

  const lines: string[] = [];

  lines.push(`# ${orgName} sponsorship proposal for ${company.name}`);
  lines.push("");
  lines.push(
    anchorEvent
      ? `A partnership proposal for ${deal.cycle}, anchored by ${anchorEvent}.`
      : `A partnership proposal for ${deal.cycle}.`,
  );
  lines.push("");

  lines.push("## Why partner with us");
  lines.push("");
  const proofBullets: string[] = [];
  if (memberCount) proofBullets.push(`- ${memberCount} members reached directly.`);
  if (hackathonReach)
    proofBullets.push(`- ${hackathonReach} through our anchor hackathon.`);
  if (currentSponsors)
    proofBullets.push(`- Trusted by ${currentSponsors}.`);
  if (proofBullets.length === 0) {
    lines.push(
      `- A committed, high-signal audience of student engineers at ${orgName}.`,
    );
  } else {
    lines.push(...proofBullets);
  }
  lines.push("");

  lines.push("## Recommended package");
  lines.push("");
  if (tier) {
    lines.push(`### ${tier.name} - ${money(tier.price)}`);
    lines.push("");
    if (tier.description) {
      lines.push(tier.description);
      lines.push("");
    }
    if (benefits.length > 0) {
      lines.push("What you get:");
      for (const b of benefits) {
        lines.push(`- ${b.title}`);
      }
      lines.push("");
    }
  } else {
    lines.push(
      "We will tailor a package to your goals - reach out and we will build it with you.",
    );
    lines.push("");
  }

  if (addonRows.length > 0) {
    lines.push("## Add-ons");
    lines.push("");
    for (const a of addonRows) {
      const pricePart = a.priceNote ? ` - ${a.priceNote}` : "";
      lines.push(`- ${a.name}${pricePart}`);
      if (a.description) {
        lines.push(`  - ${a.description}`);
      }
    }
    lines.push("");
  }

  lines.push("## Next step");
  lines.push("");
  lines.push(
    `Reply to this proposal or reach out to ${yourName} to lock in ${tier ? tier.name : "a package"} for ${deal.cycle}.`,
  );
  if (anchorEvent) {
    lines.push(`Confirm soon to be featured at ${anchorEvent}.`);
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ===========================================================================
// Fulfillment health
// ===========================================================================

/** Per-sponsor fulfillment-health row: what is owed vs delivered, plus risk. */
export interface FulfillmentHealthRow {
  companyId: number;
  companyName: string;
  dealId: number;
  stage: DealStage;
  tierName: string | null;
  /** total deliverables on the deal */
  total: number;
  /** deliverables marked done */
  done: number;
  /** open/blocked deliverables past their due date */
  overdue: number;
  /** done deliverables that captured a proof link or metric */
  proofCaptured: number;
  /** sponsor-satisfaction signal (nullable) */
  satisfaction: DealSatisfaction | null;
}

/**
 * Fulfillment health per committed-and-beyond sponsor in a cycle: for each deal
 * at committed/fulfilling/renewed, its deliverable done/total counts, overdue
 * count, how many delivered items captured proof (a link or a metric), and its
 * satisfaction signal. This is the delivered-vs-owed picture the board and a
 * successor need to prevent churn during EVP turnover. Sorted worst-first:
 * overdue deals lead, then least-complete, then by name.
 */
export async function fulfillmentHealth(cycle: string): Promise<FulfillmentHealthRow[]> {
  const today = formatISO(new Date(), { representation: "date" });

  const dealRows = await db
    .select({ deal: deals, company: companies, tier: tiers })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(tiers, eq(deals.targetTierId, tiers.id))
    .where(
      and(
        eq(deals.cycle, cycle),
        inArray(deals.stage, COMMITTED_STAGES as DealStage[]),
      ),
    )
    .all();

  const rows: FulfillmentHealthRow[] = await Promise.all(
    dealRows.map(async ({ deal, company, tier }) => {
      const items = await listDealDeliverables(deal.id);
      let done = 0;
      let overdue = 0;
      let proofCaptured = 0;
      for (const it of items) {
        const isDone = it.status === "done";
        if (isDone) {
          done += 1;
          if (
            (it.proofUrl && it.proofUrl.trim()) ||
            (it.metricValue && it.metricValue.trim())
          ) {
            proofCaptured += 1;
          }
        } else if (it.dueDate != null && it.dueDate < today) {
          overdue += 1;
        }
      }
      return {
        companyId: company.id,
        companyName: company.name,
        dealId: deal.id,
        stage: deal.stage as DealStage,
        tierName: tier?.name ?? null,
        total: items.length,
        done,
        overdue,
        proofCaptured,
        satisfaction: normalizeDealSatisfaction(deal.satisfaction),
      };
    }),
  );

  const completion = (r: FulfillmentHealthRow): number =>
    r.total === 0 ? 1 : r.done / r.total;
  return rows.sort(
    (a, b) =>
      b.overdue - a.overdue ||
      completion(a) - completion(b) ||
      a.companyName.localeCompare(b.companyName),
  );
}

// ===========================================================================
// Loss-reason analytics + recycle
// ===========================================================================

/** One loss-reason bucket: how many lapsed deals cited it, and their dollars. */
export interface LossReasonBucket {
  /** the structured loss reason, or null for lapsed deals with no reason given */
  reason: DealLostReason | null;
  label: string;
  /** lapsed deals citing this reason */
  count: number;
  /** sum of ask amounts on those deals (dollar value of what was lost) */
  lostDollars: number;
}

/**
 * Breakdown of lapsed deals by structured loss reason. Optionally scoped to a
 * cycle (omit for all-time). Buckets include a null reason for lapsed deals that
 * never recorded one. Sorted by count descending so the biggest leak leads.
 * Knowing why deals die is what lets a successor re-approach timing/budget losses
 * next cycle instead of guessing.
 */
export async function lossReasonBreakdown(cycle?: string): Promise<LossReasonBucket[]> {
  const rows = await db
    .select({ lostReason: deals.lostReason, ask: deals.askAmount })
    .from(deals)
    .where(
      cycle
        ? and(eq(deals.stage, "lapsed"), eq(deals.cycle, cycle))
        : eq(deals.stage, "lapsed"),
    )
    .all();

  const agg = new Map<
    DealLostReason | null,
    { count: number; lostDollars: number }
  >();
  for (const r of rows) {
    const reason = normalizeDealLostReason(r.lostReason);
    const entry = agg.get(reason) ?? { count: 0, lostDollars: 0 };
    entry.count += 1;
    entry.lostDollars += r.ask ?? 0;
    agg.set(reason, entry);
  }

  return Array.from(agg.entries())
    .map(([reason, v]) => ({
      reason,
      label: reason ? DEAL_LOST_REASON_LABEL[reason] : "No reason given",
      count: v.count,
      lostDollars: v.lostDollars,
    }))
    .sort((a, b) => b.count - a.count || b.lostDollars - a.lostDollars);
}

export interface RecycleResult {
  companyId: number;
  /** the fresh prospect deal created in the target cycle */
  dealId: number;
  /** the source (lapsed) deal that was recycled */
  sourceDealId: number;
  targetCycle: string;
}

/**
 * Recycle a lapsed company into the active cycle: clone the lapsed deal's context
 * (target tier, structured loss reason, champion) into a FRESH prospect-stage
 * deal in `targetCycle` (defaults to the current cycle), with a note recording
 * where it came from and an open "Re-approach - recycled from <cycle>" action due
 * in 14 days. The original lapsed deal and its history are untouched. Returns
 * null when the source deal does not exist, is not lapsed, or the company already
 * has a deal in the target cycle (so recycling is idempotent and never doubles).
 */
export async function recycleLapsedDeal(
  sourceDealId: number,
  targetCycle?: string,
  actorUserId: number | null = null,
): Promise<RecycleResult | null> {
  const source = await db
    .select()
    .from(deals)
    .where(eq(deals.id, sourceDealId))
    .get();
  if (!source || source.stage !== "lapsed") return null;

  const cycle = targetCycle ?? (await getCurrentCycle());
  if (source.cycle === cycle) return null;

  // Never double up: skip when the company already has a deal in the target cycle.
  const existing = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.companyId, source.companyId), eq(deals.cycle, cycle)))
    .get();
  if (existing) return null;

  const lostReason = normalizeDealLostReason(source.lostReason);
  const lostPart = lostReason
    ? `, lost on ${DEAL_LOST_REASON_LABEL[lostReason].toLowerCase()}`
    : "";
  const newDeal = await createDeal(
    {
      companyId: source.companyId,
      cycle,
      stage: "prospect",
      targetTierId: source.targetTierId,
      lostReason,
      championContactId: source.championContactId,
      customTerms: `Recycled from ${source.cycle}${lostPart}`,
    },
    actorUserId,
  );

  await createNextAction(
    {
      dealId: newDeal.id,
      title: `Re-approach - recycled from ${source.cycle}`,
      dueDate: formatISO(addDays(new Date(), 14), { representation: "date" }),
      createdBy: "manual",
    },
    actorUserId,
  );

  return {
    companyId: source.companyId,
    dealId: newDeal.id,
    sourceDealId: source.id,
    targetCycle: cycle,
  };
}

// ===========================================================================
// Company signals & fit scoring
// ===========================================================================

/** One entry in the fixed fit-signal catalog. */
export interface SignalDef {
  key: string;
  label: string;
  /** relative weight used by computeFitScore */
  weight: number;
}

/**
 * The fixed catalog of fit signals. `warm_path_available` and
 * `hires_our_students` carry the highest weight; the rest are secondary. Weights
 * are normalized to a 0-100 score in computeFitScore(), so their absolute
 * magnitude only matters relative to one another.
 */
export const SIGNAL_CATALOG: readonly SignalDef[] = [
  { key: "hires_our_students", label: "Hires our students", weight: 3 },
  { key: "sponsors_peer_orgs", label: "Sponsors peer orgs", weight: 2 },
  {
    key: "university_relations_budget",
    label: "Has university-relations budget",
    weight: 2,
  },
  { key: "warm_path_available", label: "Warm path available", weight: 3 },
  {
    key: "erg_or_community_presence",
    label: "Relevant ERG or community presence",
    weight: 1,
  },
  {
    key: "prior_org_contact",
    label: "Prior contact with us",
    weight: 2,
  },
] as const;

const SIGNAL_KEYS = SIGNAL_CATALOG.map((s) => s.key);

/**
 * Per-signal clause used to build {{personalization_hook}}. Each entry is a
 * lower-case dependent clause that slots naturally after a lead-in, e.g.
 * "I'm reaching out {{personalization_hook}}." -> "...since your team already
 * hires our students." Ordered by outreach salience (warm path first, then the
 * strongest fit signals) so the hook leads with the most compelling reason.
 */
const PERSONALIZATION_HOOKS: Readonly<Record<string, string>> = {
  warm_path_available: "since we already share a warm connection",
  hires_our_students: "since your team already hires students from our campus",
  prior_org_contact: "since your team has connected with us before",
  sponsors_peer_orgs: "since your team already backs student organizations like ours",
  university_relations_budget:
    "since your team already invests in university relations",
  erg_or_community_presence:
    "given your team's investment in the community we serve",
};

/**
 * Order in which personalization hooks are preferred when several signals are
 * checked; the first matching checked signal wins so the hook reads naturally
 * and leads with the most persuasive reason.
 */
const PERSONALIZATION_HOOK_ORDER: readonly string[] = [
  "warm_path_available",
  "hires_our_students",
  "prior_org_contact",
  "sponsors_peer_orgs",
  "university_relations_budget",
  "erg_or_community_presence",
];

/**
 * Neutral {{personalization_hook}} fallback used when a company has no checked
 * fit signals, so a cold email still reads well ("I'm reaching out because I
 * think we would be a strong fit for your team").
 */
export const NEUTRAL_PERSONALIZATION_HOOK =
  "because I think we would be a strong fit for your team";

/**
 * A single dependent clause for {{personalization_hook}}, derived from a
 * company's checked fit signals. Picks the highest-salience checked signal's
 * clause (per PERSONALIZATION_HOOK_ORDER); falls back to the neutral hook when
 * nothing is checked.
 */
export async function computePersonalizationHook(companyId: number): Promise<string> {
  const signals = await getCompanySignals(companyId);
  const checked = new Set(
    signals
      .filter((s) => s.checked)
      .map((s) => s.key),
  );
  for (const key of PERSONALIZATION_HOOK_ORDER) {
    if (checked.has(key) && PERSONALIZATION_HOOKS[key]) {
      return PERSONALIZATION_HOOKS[key];
    }
  }
  return NEUTRAL_PERSONALIZATION_HOOK;
}

/**
 * All catalog signals for a company, each carrying its checked/note state.
 * Signals never persisted yet default to unchecked with an empty note, so the
 * result always covers the full catalog in catalog order.
 */
export async function getCompanySignals(companyId: number): Promise<Array<
  SignalDef & { checked: boolean; note: string | null }
>> {
  const rows = await db
    .select()
    .from(companySignals)
    .where(eq(companySignals.companyId, companyId))
    .all();
  const byKey = new Map<string, CompanySignal>(
    rows.map((r) => [r.signalKey, r]),
  );
  return SIGNAL_CATALOG.map((def) => {
    const row = byKey.get(def.key);
    return {
      ...def,
      checked: row?.checked ?? false,
      note: row?.note ?? null,
    };
  });
}

/**
 * Bulk version of getCompanySignals: fetch signals for many companies in one
 * query and return a map keyed by company id. Entries not present in the DB get
 * the full catalog with every signal unchecked - same contract as the single
 * variant, just without N round-trips.
 */
export async function getCompanySignalsBulk(
  companyIds: number[],
): Promise<Map<number, Array<SignalDef & { checked: boolean; note: string | null }>>> {
  if (companyIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(companySignals)
    .where(inArray(companySignals.companyId, companyIds))
    .all();
  const byCompany = new Map<number, Map<string, CompanySignal>>();
  for (const row of rows) {
    if (!byCompany.has(row.companyId)) byCompany.set(row.companyId, new Map());
    byCompany.get(row.companyId)!.set(row.signalKey, row);
  }
  const result = new Map<
    number,
    Array<SignalDef & { checked: boolean; note: string | null }>
  >();
  for (const id of companyIds) {
    const byKey = byCompany.get(id) ?? new Map<string, CompanySignal>();
    result.set(
      id,
      SIGNAL_CATALOG.map((def) => {
        const row = byKey.get(def.key);
        return { ...def, checked: row?.checked ?? false, note: row?.note ?? null };
      }),
    );
  }
  return result;
}

/**
 * Upsert one company signal. Unknown keys (not in the catalog) are ignored so
 * the fit score stays well-defined.
 */
export async function setCompanySignal(
  companyId: number,
  key: string,
  checked: boolean,
  note?: string | null,
  actorUserId: number | null = null,
): Promise<void> {
  if (!SIGNAL_KEYS.includes(key)) return;
  const existing = await db
    .select()
    .from(companySignals)
    .where(
      and(
        eq(companySignals.companyId, companyId),
        eq(companySignals.signalKey, key),
      ),
    )
    .get();
  if (existing) {
    const row = await db.update(companySignals)
      .set({ checked, note: note ?? null })
      .where(eq(companySignals.id, existing.id))
      .returning()
      .get();
    if (row) await logAudit(actorUserId, "company_signals", row.id, "update", row);
  } else {
    const row = await db.insert(companySignals)
      .values({ companyId, signalKey: key, checked, note: note ?? null })
      .returning()
      .get();
    await logAudit(actorUserId, "company_signals", row.id, "insert", row);
  }
}

/**
 * Weighted fit score in [0, 100]: the sum of weights of checked signals divided
 * by the total catalog weight, times 100, rounded to the nearest integer.
 */
export async function computeFitScore(companyId: number): Promise<number> {
  return computeFitScoreFromSignals(await getCompanySignals(companyId));
}

/** Same calculation as computeFitScore but from a pre-fetched signals array. */
function computeFitScoreFromSignals(
  signals: Array<{ checked: boolean; weight: number }>,
): number {
  const totalWeight = SIGNAL_CATALOG.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const earned = signals.reduce(
    (sum, s) => sum + (s.checked ? s.weight : 0),
    0,
  );
  return Math.round((earned / totalWeight) * 100);
}

/**
 * Priority weight (in fit-score points) blended into the prospect-pool ranking
 * so a high-priority target outranks a marginally-better-fit low-priority one.
 * Documented alongside the composite rank in listProspectPool().
 */
export const PRIORITY_WEIGHT: Readonly<Record<CompanyPriority, number>> = {
  high: 100,
  medium: 50,
  low: 0,
} as const;

/**
 * Max points the expected-tier (dollar potential) axis can add to the composite
 * rank. Kept below the priority (100) and fit (100) weights so tier size is a
 * meaningful but secondary tie-breaker, not a dominant one. A prospect tagged
 * with the anchor (top-priced) tier earns the full weight; smaller tiers earn a
 * proportional share; an untagged prospect earns 0 (neutral).
 */
export const TIER_VALUE_WEIGHT = 40;

/** A prospect-pool row: a company plus its fit score and signals summary. */
export interface ProspectPoolEntry {
  company: Company;
  /** will-they-say-yes score in [0, 100] from checked fit signals */
  fitScore: number;
  /** the company's priority band (high | medium | low) */
  priority: CompanyPriority;
  /**
   * Composite expected-value rank = PRIORITY_WEIGHT[priority] (how much we want
   * them: 100/50/0) + fitScore (will they say yes: 0-100) + a tier-value bonus
   * (dollar potential: 0 to TIER_VALUE_WEIGHT), so it lives in [0, 240]. The
   * pool sorts by this descending. All input axes are surfaced on the row so the
   * number stays legible.
   */
  compositeRank: number;
  source: string | null;
  /** number of catalog signals checked */
  signalsChecked: number;
  /** total catalog signals */
  signalsTotal: number;
  /**
   * True when the company has no persisted company_signals rows at all - i.e.
   * nobody has scored its fit yet. Distinguishes "not researched" (score is
   * meaningless) from "researched, genuinely low fit" (score is a real zero).
   */
  needsResearch: boolean;
  /** expected/target tier for dollar potential, if tagged (else null) */
  expectedTier: Tier | null;
  /** true when the expected tier is the anchor (top-priced active) tier */
  canHitAnchor: boolean;
  /** newest deal for the company, if any (else null) */
  newestDeal: Deal | null;
  /**
   * The last date outreach can responsibly start and still realistically close
   * before the active cycle's anchor event: anchor date minus the stage's typical
   * days-to-close (ISO date, YYYY-MM-DD). Null when there is no anchor date set.
   * Past dates mean the window is already closing.
   */
  lastResponsibleStart: string | null;
  /** full signal list pre-fetched so callers avoid per-company queries */
  signals: Array<SignalDef & { checked: boolean; note: string | null }>;
  /** warm/cold relationship classification pre-computed from deal history */
  relationship: CompanyRelationship;
}

/**
 * The last date outreach can responsibly start on a deal at `stage` and still
 * close before the anchor event: `anchorEventDate` minus the stage's typical
 * days-to-close (STAGE_MIN_DAYS_TO_CLOSE). Returns an ISO date (YYYY-MM-DD), or
 * null when no anchor date is known or the stage has no days-to-close budget.
 */
export function lastResponsibleStartDate(
  stage: DealStage,
  anchorEventDate: string | null,
): string | null {
  if (!anchorEventDate) return null;
  const minDays = STAGE_MIN_DAYS_TO_CLOSE[stage];
  if (minDays == null) return null;
  const anchor = new Date(`${anchorEventDate}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return null;
  return formatISO(addDays(anchor, -minDays), { representation: "date" });
}

/**
 * The documented composite rank: priority weight (0-100) + fit score (0-100) +
 * a tier-value bonus (0-TIER_VALUE_WEIGHT), in [0, 240]. The tier bonus is the
 * expected tier's price as a fraction of the anchor tier's price, so a prospect
 * tagged with the anchor tier earns the full weight and an untagged prospect
 * (or a zero anchor price) earns nothing.
 */
export function prospectCompositeRank(
  priority: CompanyPriority,
  fitScore: number,
  expectedTierPrice: number | null = null,
  anchorTierPrice: number | null = null,
): number {
  let tierBonus = 0;
  if (expectedTierPrice != null && anchorTierPrice && anchorTierPrice > 0) {
    const ratio = Math.min(1, expectedTierPrice / anchorTierPrice);
    tierBonus = Math.round(TIER_VALUE_WEIGHT * ratio);
  }
  return PRIORITY_WEIGHT[priority] + fitScore + tierBonus;
}

/** Per-prospect outreach status, for the pool's "where does this stand" column. */
export interface ProspectOutreachStatus {
  /** assigned cadence name, or null when the deal has no cadence */
  cadenceName: string | null;
  /** 1-based step position the deal is on within its cadence, or null */
  cadenceStep: number | null;
  /** total steps in the assigned cadence, or null */
  cadenceStepsTotal: number | null;
  /** most recent touchpoint on this deal (ISO), or null when never touched */
  lastTouchAt: string | null;
  /** earliest open next-action due date on this deal, or null */
  nextDueDate: string | null;
  /** true when no touchpoint has ever been logged against this deal */
  noTouchYet: boolean;
}

/**
 * Compute the outreach status of a prospect deal: its cadence + step X of N,
 * last touch, and next due. `noTouchYet` powers the pool's "no touch yet"
 * filter. A dealless pool company (companyDealId null) is treated as untouched.
 */
export async function prospectOutreachStatus(
  dealId: number | null,
): Promise<ProspectOutreachStatus> {
  const empty: ProspectOutreachStatus = {
    cadenceName: null,
    cadenceStep: null,
    cadenceStepsTotal: null,
    lastTouchAt: null,
    nextDueDate: null,
    noTouchYet: true,
  };
  if (dealId == null) return empty;

  const deal = await db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) return empty;

  let cadenceName: string | null = null;
  let cadenceStep: number | null = null;
  let cadenceStepsTotal: number | null = null;
  if (deal.cadenceId != null) {
    const cadence = await db
      .select()
      .from(cadences)
      .where(eq(cadences.id, deal.cadenceId))
      .get();
    cadenceName = cadence?.name ?? null;
    const cadenceStepRows = await db
      .select({ id: cadenceSteps.id })
      .from(cadenceSteps)
      .where(eq(cadenceSteps.cadenceId, deal.cadenceId))
      .all();
    cadenceStepsTotal = cadenceStepRows.length;
    // cadenceStepIndex is the NEXT step to schedule; the deal is "on" that step
    // (1-based), clamped to the total so an exhausted cadence reads "N of N".
    cadenceStep = Math.min(deal.cadenceStepIndex + 1, cadenceStepsTotal);
  }

  const lastTouch = await db
    .select({ at: sql<string>`max(${touchpoints.occurredAt})` })
    .from(touchpoints)
    .where(eq(touchpoints.dealId, dealId))
    .get();
  const lastTouchAt = lastTouch?.at ?? null;

  const nextAction = await db
    .select({ due: nextActions.dueDate })
    .from(nextActions)
    .where(and(eq(nextActions.dealId, dealId), eq(nextActions.status, "open")))
    .orderBy(asc(nextActions.dueDate))
    .get();

  return {
    cadenceName,
    cadenceStep,
    cadenceStepsTotal,
    lastTouchAt,
    nextDueDate: nextAction?.due ?? null,
    noTouchYet: lastTouchAt == null,
  };
}

/**
 * Bulk version of prospectOutreachStatus: resolve outreach status for many
 * deals in 4 queries total (deals, cadences, step counts, touchpoints, actions)
 * instead of 5 queries per deal. The map is keyed by deal id; null maps to the
 * empty/untouched status so callers can pass newestDeal?.id ?? null directly.
 */
export async function prospectOutreachStatusBulk(
  dealIds: Array<number | null>,
): Promise<Map<number | null, ProspectOutreachStatus>> {
  const empty: ProspectOutreachStatus = {
    cadenceName: null,
    cadenceStep: null,
    cadenceStepsTotal: null,
    lastTouchAt: null,
    nextDueDate: null,
    noTouchYet: true,
  };
  const result = new Map<number | null, ProspectOutreachStatus>();
  result.set(null, empty);

  const realIds = dealIds.filter((id): id is number => id != null);
  if (realIds.length === 0) return result;

  const dealRows = await db
    .select()
    .from(deals)
    .where(inArray(deals.id, realIds))
    .all();
  const dealById = new Map<number, Deal>(dealRows.map((d) => [d.id, d]));

  const cadenceIds = [
    ...new Set(
      dealRows
        .map((d) => d.cadenceId)
        .filter((id): id is number => id != null),
    ),
  ];
  const cadenceNameById = new Map<number, string>();
  const cadenceStepCountById = new Map<number, number>();
  if (cadenceIds.length > 0) {
    const cadenceRows = await db
      .select()
      .from(cadences)
      .where(inArray(cadences.id, cadenceIds))
      .all();
    for (const c of cadenceRows) cadenceNameById.set(c.id, c.name);

    const stepCounts = await db
      .select({
        cadenceId: cadenceSteps.cadenceId,
        count: sql<number>`count(*)`,
      })
      .from(cadenceSteps)
      .where(inArray(cadenceSteps.cadenceId, cadenceIds))
      .groupBy(cadenceSteps.cadenceId)
      .all();
    for (const r of stepCounts) cadenceStepCountById.set(r.cadenceId, r.count);
  }

  const lastTouchRows = await db
    .select({
      dealId: touchpoints.dealId,
      lastAt: sql<string>`max(${touchpoints.occurredAt})`,
    })
    .from(touchpoints)
    .where(inArray(touchpoints.dealId, realIds))
    .groupBy(touchpoints.dealId)
    .all();
  const lastTouchByDeal = new Map<number, string>();
  for (const r of lastTouchRows) {
    if (r.dealId != null) lastTouchByDeal.set(r.dealId, r.lastAt);
  }

  const actionRows = await db
    .select({ dealId: nextActions.dealId, due: nextActions.dueDate })
    .from(nextActions)
    .where(
      and(inArray(nextActions.dealId, realIds), eq(nextActions.status, "open")),
    )
    .orderBy(asc(nextActions.dueDate))
    .all();
  const nextDueByDeal = new Map<number, string>();
  for (const r of actionRows) {
    if (!nextDueByDeal.has(r.dealId)) nextDueByDeal.set(r.dealId, r.due);
  }

  for (const id of realIds) {
    const deal = dealById.get(id);
    if (!deal) { result.set(id, empty); continue; }

    let cadenceName: string | null = null;
    let cadenceStep: number | null = null;
    let cadenceStepsTotal: number | null = null;
    if (deal.cadenceId != null) {
      cadenceName = cadenceNameById.get(deal.cadenceId) ?? null;
      cadenceStepsTotal = cadenceStepCountById.get(deal.cadenceId) ?? 0;
      cadenceStep = Math.min(deal.cadenceStepIndex + 1, cadenceStepsTotal);
    }

    const lastTouchAt = lastTouchByDeal.get(id) ?? null;
    result.set(id, {
      cadenceName,
      cadenceStep,
      cadenceStepsTotal,
      lastTouchAt,
      nextDueDate: nextDueByDeal.get(id) ?? null,
      noTouchYet: lastTouchAt == null,
    });
  }
  return result;
}

/**
 * Companies at the top of the funnel: those whose newest deal is in stage
 * prospect or outreach, plus companies that have no deal at all. Each entry
 * carries a computed fit score and a signals summary.
 *
 * Ordering is by compositeRank descending (PRIORITY_WEIGHT[priority] + fitScore
 * = how much we want them x will they say yes), so the pool can be worked
 * top-down. Ties break on fitScore, then name.
 */
export async function listProspectPool(): Promise<ProspectPoolEntry[]> {
  const allCompanies = await db.select().from(companies).all();
  const allDeals = await db
    .select()
    .from(deals)
    .orderBy(desc(deals.createdAt))
    .all();

  const newestByCompany = new Map<number, Deal>();
  for (const d of allDeals) {
    if (!newestByCompany.has(d.companyId)) newestByCompany.set(d.companyId, d);
  }

  // Tier lookup + the anchor (top-priced active) tier, for dollar-potential
  // weighting. The expected tier is the company's tag, falling back to its
  // newest deal's target tier.
  const allTiers = await db
    .select()
    .from(tiers)
    .all();
  const tierById = new Map<number, Tier>(allTiers.map((t) => [t.id, t]));
  const anchorTier = Array.from(tierById.values())
    .filter((t) => t.active)
    .reduce<Tier | null>(
      (top, t) => (top == null || t.price > top.price ? t : top),
      null,
    );
  const anchorPrice = anchorTier?.price ?? null;

  // Fetch ALL signals for ALL companies in one query, keyed by company id.
  const allCompanyIds = allCompanies.map((c) => c.id);
  const allSignalsByCompany = await getCompanySignalsBulk(allCompanyIds);

  // Companies with at least one persisted signal row (of any checked state) -
  // used to tell "not yet researched" apart from "researched, scored zero".
  // We need the raw company IDs that have any row, not just checked ones.
  const researchedRows =
    allCompanyIds.length > 0
      ? await db
          .selectDistinct({ companyId: companySignals.companyId })
          .from(companySignals)
          .where(inArray(companySignals.companyId, allCompanyIds))
          .all()
      : [];
  const researchedCompanyIds = new Set(researchedRows.map((r) => r.companyId));

  // Pre-compute relationship for every company using already-loaded deals -
  // avoids N per-company DB round-trips from classifyCompanyRelationship().
  const today = formatISO(new Date(), { representation: "date" });
  const currentCycle = await getCurrentCycle();
  const engagedStages = new Set<string>(PRIOR_RELATIONSHIP_STAGES);
  const dealsByCompany = new Map<number, Array<{ cycle: string; stage: string }>>();
  for (const d of allDeals) {
    if (!dealsByCompany.has(d.companyId)) dealsByCompany.set(d.companyId, []);
    dealsByCompany.get(d.companyId)!.push({ cycle: d.cycle, stage: d.stage });
  }

  const { anchorEventDate } = await getActiveCycleAnchor();

  const entries: ProspectPoolEntry[] = [];
  for (const company of allCompanies) {
    const newest = newestByCompany.get(company.id) ?? null;
    const inPool =
      newest === null ||
      newest.stage === "prospect" ||
      newest.stage === "outreach";
    if (!inPool) continue;
    // Suppress companies deferred to a future date - they resurface via
    // listResurfacingProspects on/after their re-ask date, not the cold pool.
    if (company.reAskOn && company.reAskOn > today) continue;

    const signals =
      allSignalsByCompany.get(company.id) ??
      SIGNAL_CATALOG.map((def) => ({ ...def, checked: false, note: null }));
    const fitScore = computeFitScoreFromSignals(signals);
    const priority = normalizeCompanyPriority(company.priority);
    const expectedTierId =
      company.expectedTierId ?? newest?.targetTierId ?? null;
    const expectedTier =
      expectedTierId != null ? tierById.get(expectedTierId) ?? null : null;

    // Classify relationship inline using pre-loaded data.
    let relationship: CompanyRelationship = "cold";
    if (company.reAskOn && company.reAskOn > today) {
      relationship = "do_not_contact_yet";
    } else {
      for (const d of dealsByCompany.get(company.id) ?? []) {
        if (d.cycle < currentCycle || engagedStages.has(d.stage)) {
          relationship = "prior_relationship";
          break;
        }
      }
    }

    entries.push({
      company,
      fitScore,
      priority,
      compositeRank: prospectCompositeRank(
        priority,
        fitScore,
        expectedTier?.price ?? null,
        anchorPrice,
      ),
      source: company.source ?? null,
      signalsChecked: signals.filter((s) => s.checked).length,
      signalsTotal: SIGNAL_CATALOG.length,
      needsResearch: !researchedCompanyIds.has(company.id),
      expectedTier,
      canHitAnchor: expectedTier != null && expectedTier.id === anchorTier?.id,
      newestDeal: newest,
      lastResponsibleStart: lastResponsibleStartDate(
        (newest?.stage as DealStage) ?? "prospect",
        anchorEventDate,
      ),
      signals,
      relationship,
    });
  }

  entries.sort(
    (a, b) =>
      b.compositeRank - a.compositeRank ||
      b.fitScore - a.fitScore ||
      a.company.name.localeCompare(b.company.name),
  );
  return entries;
}

/**
 * The top `limit` untouched prospects to start outreach on, drawn from the
 * composite-ranked pool. "Untouched/startable" means the company's newest deal
 * is still in the prospect stage (so Start outreach is a real one-click move);
 * pool entries with no deal or already in outreach are skipped. Ordering follows
 * listProspectPool's composite EV rank, so this is the top of the daily queue.
 */
export async function topProspectsToStart(limit = 5): Promise<ProspectPoolEntry[]> {
  const pool = await listProspectPool();
  const startable = pool.filter(
    (e) => e.newestDeal != null && e.newestDeal.stage === "prospect",
  );
  return startable.slice(0, limit);
}

/**
 * Default number of prospects one volunteer can realistically launch (and then
 * follow up on) in a week. Overridable via the weekly_launch_quota setting.
 */
export const DEFAULT_WEEKLY_LAUNCH_QUOTA = 10;

/**
 * The weekly launch quota: the weekly_launch_quota setting parsed as a positive
 * integer, falling back to DEFAULT_WEEKLY_LAUNCH_QUOTA when unset or invalid.
 */
export async function getWeeklyLaunchQuota(): Promise<number> {
  const raw = Number(await getSetting("weekly_launch_quota"));
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : DEFAULT_WEEKLY_LAUNCH_QUOTA;
}

/**
 * This week's launch cohort: the top-ranked startable prospects (newest deal in
 * the prospect stage) up to `limit`, defaulting to the weekly launch quota. This
 * is a capacity-bounded slice of topProspectsToStart so one volunteer launches
 * only what they can actually follow up on.
 */
export async function listLaunchCohort(
  limit?: number,
): Promise<ProspectPoolEntry[]> {
  const effectiveLimit = limit ?? (await getWeeklyLaunchQuota());
  return await topProspectsToStart(effectiveLimit);
}

/**
 * Composite-rank floor for a prospect to count as "winnable" backlog: a
 * high-priority company (weight 100) always clears it, as does a medium-priority
 * one with a real fit score. Cold, low-priority, low-fit prospects sit below it,
 * so the backlog-vs-runway warning counts only prospects genuinely worth working.
 */
export const WINNABLE_RANK_THRESHOLD = 100;

/** Backlog-vs-runway capacity picture for a cycle, for the Today warning banner. */
export interface OutreachCapacityStatus {
  /** whole weeks left until the anchor event (0 when past or no anchor date) */
  weeksRemaining: number | null;
  /** weeksRemaining * weekly launch quota - how many launches there is time for */
  capacity: number | null;
  /** un-launched startable prospects above the winnable rank threshold */
  winnableBacklog: number;
  /** the weekly launch quota used for the capacity calculation */
  weeklyQuota: number;
  /** true when the winnable backlog cannot be worked in the remaining runway */
  overCapacity: boolean;
}

/**
 * Compare the un-launched winnable backlog against the remaining runway. Weeks
 * remaining come from the active cycle's anchor date; capacity is that times the
 * weekly launch quota. The winnable backlog is the count of startable prospects
 * (newest deal still in the prospect stage) whose composite rank clears
 * WINNABLE_RANK_THRESHOLD. When the backlog exceeds capacity, no amount of email
 * will clear it in time - the caller warns accordingly. `overCapacity` is false
 * when there is no anchor date (runway unknown).
 */
export async function outreachCapacityStatus(cycle: string): Promise<OutreachCapacityStatus> {
  void cycle; // reserved: today the pool is cycle-agnostic; kept for a stable API
  const weeklyQuota = await getWeeklyLaunchQuota();
  const { daysRemaining } = await getActiveCycleAnchor();

  const weeksRemaining =
    daysRemaining != null ? Math.max(0, Math.floor(daysRemaining / 7)) : null;
  const capacity = weeksRemaining != null ? weeksRemaining * weeklyQuota : null;

  const pool = await listProspectPool();
  const winnableBacklog = pool.filter(
    (e) =>
      e.newestDeal != null &&
      e.newestDeal.stage === "prospect" &&
      e.compositeRank >= WINNABLE_RANK_THRESHOLD,
  ).length;

  const overCapacity = capacity != null && winnableBacklog > capacity;

  return {
    weeksRemaining,
    capacity,
    winnableBacklog,
    weeklyQuota,
    overCapacity,
  };
}

// ---------------------------------------------------------------------------
// Weekly outreach scoreboard (quota accountability)
// ---------------------------------------------------------------------------

/**
 * Trailing window (days) for the reply-rate signal on the weekly scoreboard.
 * Reply rate is measured over a trailing window rather than the current week so
 * a fresh Monday doesn't read as 0% before any replies have had time to land.
 */
export const REPLY_RATE_WINDOW_DAYS = 30;

/**
 * The weekly scoreboard: what actually happened this week measured against the
 * outreach quota. This is the accountability half of the quota system - the
 * launch cohort tells you what to start, this tells you whether you did it.
 *
 * A "thread" is keyed by deal when a touchpoint has one, else by company, so a
 * touch logged before a deal exists still counts. A thread's first outbound
 * touch is a NEW touch (top-of-funnel); every later outbound touch on the same
 * thread is a FOLLOW-UP. The two are tracked separately on purpose: the new-touch
 * count is the quota you protect, follow-ups are the time-boxed remainder.
 */
export interface WeeklyScoreboard {
  /** ISO date (YYYY-MM-DD) of this week's Monday */
  weekStart: string;
  /** ISO date of this week's Sunday */
  weekEnd: string;
  /** today's ISO date - the right edge of the "came due so far" window */
  today: string;
  /** threads whose FIRST outbound touch landed this week (new top-of-funnel) */
  newTouches: number;
  /** the weekly new-touch quota (shared with the launch cohort) */
  newTouchQuota: number;
  /** outbound follow-up touches sent this week (not a thread's first touch) */
  followUpsSent: number;
  /** next actions that came due between Monday and today */
  dueTotal: number;
  /** of dueTotal, how many are marked done */
  dueCompleted: number;
  /** new threads started in the trailing reply-rate window */
  replyStarted: number;
  /** of those, how many ever drew an inbound reply */
  replyReplied: number;
  /** replyReplied / replyStarted, 0 when nothing was started */
  replyRate: number;
  /** meeting-channel touches booked this week */
  meetingsBooked: number;
  /** stage transitions recorded this week (pipeline movement) */
  dealsAdvanced: number;
}

/** Thread key for a touchpoint: its deal when present, else its company. */
function threadKey(dealId: number | null, companyId: number): string {
  return dealId != null ? `d:${dealId}` : `c:${companyId}`;
}

/**
 * Compute the outreach scoreboard for the week containing `reference` (defaults
 * to now, i.e. the current week). Passing a date inside a past week - e.g. last
 * Sunday - yields that full week's recap, which is how the Discord bot's Monday
 * digest reports on the week that just ended. Single-user CRM volumes are small,
 * so the outbound/inbound touch sets are pulled once and aggregated in JS rather
 * than with per-metric SQL.
 */
export async function weeklyScoreboard(
  reference?: Date,
): Promise<WeeklyScoreboard> {
  const now = reference ?? new Date();
  const nowMs = now.getTime();
  const weekStartDate = startOfWeek(now, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(now, { weekStartsOn: 1 });
  const weekStartMs = weekStartDate.getTime();
  const weekEndMs = weekEndDate.getTime();
  const windowStartMs = nowMs - REPLY_RATE_WINDOW_DAYS * 86_400_000;

  const weekStart = formatISO(weekStartDate, { representation: "date" });
  const weekEnd = formatISO(weekEndDate, { representation: "date" });
  const today = formatISO(now, { representation: "date" });

  // --- Outbound touches: split into new (first per thread) vs follow-up. ---
  const outbound = await db
    .select({
      dealId: touchpoints.dealId,
      companyId: touchpoints.companyId,
      occurredAt: touchpoints.occurredAt,
    })
    .from(touchpoints)
    .where(eq(touchpoints.direction, "outbound"))
    .all();

  const earliestByThread = new Map<string, number>();
  for (const t of outbound) {
    const ms = new Date(t.occurredAt).getTime();
    if (!Number.isFinite(ms)) continue;
    const key = threadKey(t.dealId, t.companyId);
    const prev = earliestByThread.get(key);
    if (prev == null || ms < prev) earliestByThread.set(key, ms);
  }

  let newTouches = 0;
  for (const ms of earliestByThread.values()) {
    if (ms >= weekStartMs && ms <= weekEndMs) newTouches += 1;
  }

  let followUpsSent = 0;
  for (const t of outbound) {
    const ms = new Date(t.occurredAt).getTime();
    if (!Number.isFinite(ms) || ms < weekStartMs || ms > weekEndMs) continue;
    const key = threadKey(t.dealId, t.companyId);
    // A touch is a follow-up when it is not its thread's earliest outbound touch.
    if (earliestByThread.get(key) !== ms) followUpsSent += 1;
  }

  // --- Reply rate (trailing window, thread-level): of threads whose first
  // outbound touch landed in the window, how many ever drew an inbound reply. ---
  const inboundThreads = new Set<string>();
  for (const t of await db
    .select({ dealId: touchpoints.dealId, companyId: touchpoints.companyId })
    .from(touchpoints)
    .where(eq(touchpoints.direction, "inbound"))
    .all()) {
    inboundThreads.add(threadKey(t.dealId, t.companyId));
  }

  let replyStarted = 0;
  let replyReplied = 0;
  for (const [key, ms] of earliestByThread) {
    if (ms < windowStartMs || ms > nowMs) continue;
    replyStarted += 1;
    if (inboundThreads.has(key)) replyReplied += 1;
  }
  const replyRate = replyStarted > 0 ? replyReplied / replyStarted : 0;

  // --- Follow-ups that came due Monday..today: done vs total. dueDate may be a
  // bare date or a full ISO timestamp, so compare on the leading date prefix. ---
  const dueRows = await db
    .select({ status: nextActions.status, dueDate: nextActions.dueDate })
    .from(nextActions)
    .where(
      and(
        sql`substr(${nextActions.dueDate}, 1, 10) >= ${weekStart}`,
        sql`substr(${nextActions.dueDate}, 1, 10) <= ${today}`,
      ),
    )
    .all();
  const dueTotal = dueRows.length;
  const dueCompleted = dueRows.filter((r) => r.status === "done").length;

  // --- Meetings booked this week (meeting-channel touches). ---
  let meetingsBooked = 0;
  for (const t of await db
    .select({ occurredAt: touchpoints.occurredAt })
    .from(touchpoints)
    .where(eq(touchpoints.channel, "meeting"))
    .all()) {
    const ms = new Date(t.occurredAt).getTime();
    if (Number.isFinite(ms) && ms >= weekStartMs && ms <= weekEndMs) {
      meetingsBooked += 1;
    }
  }

  // --- Pipeline movement this week (stage transitions). ---
  let dealsAdvanced = 0;
  for (const e of await db
    .select({ enteredAt: stageEvents.enteredAt })
    .from(stageEvents)
    .all()) {
    const ms = new Date(e.enteredAt).getTime();
    if (Number.isFinite(ms) && ms >= weekStartMs && ms <= weekEndMs) {
      dealsAdvanced += 1;
    }
  }

  return {
    weekStart,
    weekEnd,
    today,
    newTouches,
    newTouchQuota: await getWeeklyLaunchQuota(),
    followUpsSent,
    dueTotal,
    dueCompleted,
    replyStarted,
    replyReplied,
    replyRate,
    meetingsBooked,
    dealsAdvanced,
  };
}

/** A company whose dated re-approach has come due. */
export interface ResurfacingProspect {
  company: Company;
  reAskOn: string;
  reAskReason: string | null;
  /** newest deal for the company, if any (else null) */
  newestDeal: Deal | null;
}

/**
 * Companies whose re-ask date has arrived (reAskOn on or before today) - the
 * warm "come back later" promises now due. These are deliberately excluded from
 * the cold pool by listProspectPool, so this is the only surface that honors
 * them. Ordered by re-ask date (longest overdue first).
 */
export async function listResurfacingProspects(): Promise<ResurfacingProspect[]> {
  const today = formatISO(new Date(), { representation: "date" });
  const rows = await db
    .select()
    .from(companies)
    .where(sql`${companies.reAskOn} is not null and ${companies.reAskOn} <= ${today}`)
    .orderBy(asc(companies.reAskOn))
    .all();

  const newestByCompany = new Map<number, Deal>();
  for (const d of await db.select().from(deals).orderBy(desc(deals.createdAt)).all()) {
    if (!newestByCompany.has(d.companyId)) newestByCompany.set(d.companyId, d);
  }

  return rows.map((company) => ({
    company,
    reAskOn: company.reAskOn as string,
    reAskReason: company.reAskReason ?? null,
    newestDeal: newestByCompany.get(company.id) ?? null,
  }));
}

/** A promised re-ask commitment: a company with a non-null re_ask_on. */
export interface ReAskCommitment {
  company: Company;
  reAskOn: string;
  reAskReason: string | null;
  /**
   * The contact most plausibly behind the promise, when identifiable: the
   * contact on the company's most recent touchpoint. Null when no touchpoint
   * names a contact.
   */
  contact: Contact | null;
}

/**
 * Every company that has committed us to a future re-ask (a non-null re_ask_on),
 * regardless of whether it has any deal. The handoff's deal-driven sections
 * inner-join on deals, so a "come back in the fall" company with no deal would
 * otherwise vanish from a successor's briefing - this surfaces them. Ordered by
 * re-ask date (soonest first). The contact, when identifiable, is whoever was on
 * the company's most recent touchpoint.
 */
export async function listReAskCommitments(): Promise<ReAskCommitment[]> {
  const rows = await db
    .select()
    .from(companies)
    .where(sql`${companies.reAskOn} is not null`)
    .orderBy(asc(companies.reAskOn))
    .all();
  if (rows.length === 0) return [];

  const companyIds = rows.map((c) => c.id);

  // Most recent touchpoint that names a contact, per company.
  const touchRows = await db
    .select({
      companyId: touchpoints.companyId,
      occurredAt: touchpoints.occurredAt,
      contactId: touchpoints.contactId,
    })
    .from(touchpoints)
    .where(
      and(
        inArray(touchpoints.companyId, companyIds),
        sql`${touchpoints.contactId} is not null`,
      ),
    )
    .orderBy(desc(touchpoints.occurredAt))
    .all();
  const latestContactIdByCompany = new Map<number, number>();
  for (const t of touchRows) {
    if (t.contactId != null && !latestContactIdByCompany.has(t.companyId)) {
      latestContactIdByCompany.set(t.companyId, t.contactId);
    }
  }

  const contactIds = Array.from(new Set(latestContactIdByCompany.values()));
  const contactById = new Map<number, Contact>(
    (contactIds.length
      ? await db.select().from(contacts).where(inArray(contacts.id, contactIds)).all()
      : []
    ).map((c) => [c.id, c]),
  );

  return rows.map((company) => {
    const contactId = latestContactIdByCompany.get(company.id);
    return {
      company,
      reAskOn: company.reAskOn as string,
      reAskReason: company.reAskReason ?? null,
      contact: contactId != null ? contactById.get(contactId) ?? null : null,
    };
  });
}

/** Default lookahead (days) for the budget-window nudge on Today. */
export const DEFAULT_BUDGET_WINDOW_DAYS = 45;

/** A company whose fiscal-year-end (budget window) is closing soon. */
export interface ClosingBudgetWindow {
  company: Company;
  /** the company's fiscal-year-end (ISO YYYY-MM-DD) */
  fiscalYearEnd: string;
  /** whole days from today until the fiscal-year-end (>= 0) */
  daysUntil: number;
  /** newest deal for the company, if any (else null) */
  newestDeal: Deal | null;
}

/**
 * Companies whose fiscal-year-end falls within the next `days` (and not in the
 * past), soonest first. Budget usually has to be spent before the fiscal-year
 * boundary, so an ask that lands after it is dead on arrival - these companies
 * are the ones to reach before their window closes. Only companies with a
 * fiscal_year_end on file are considered.
 */
export async function companiesWithClosingBudgetWindow(
  days = DEFAULT_BUDGET_WINDOW_DAYS,
): Promise<ClosingBudgetWindow[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = formatISO(today, { representation: "date" });
  const cutoffIso = formatISO(addDays(today, days), { representation: "date" });

  const rows = await db
    .select()
    .from(companies)
    .where(
      sql`${companies.fiscalYearEnd} is not null and ${companies.fiscalYearEnd} >= ${todayIso} and ${companies.fiscalYearEnd} <= ${cutoffIso}`,
    )
    .orderBy(asc(companies.fiscalYearEnd))
    .all();
  if (rows.length === 0) return [];

  const newestByCompany = new Map<number, Deal>();
  for (const d of await db.select().from(deals).orderBy(desc(deals.createdAt)).all()) {
    if (!newestByCompany.has(d.companyId)) newestByCompany.set(d.companyId, d);
  }

  return rows.map((company) => {
    const fye = company.fiscalYearEnd as string;
    const daysUntil = differenceInCalendarDays(
      new Date(`${fye}T00:00:00`),
      today,
    );
    return {
      company,
      fiscalYearEnd: fye,
      daysUntil: Math.max(0, daysUntil),
      newestDeal: newestByCompany.get(company.id) ?? null,
    };
  });
}

// ===========================================================================
// Revenue summary
// ===========================================================================

/** Per-stage weight used to weight the pipeline toward expected revenue. */
export const STAGE_WEIGHTS: Readonly<Partial<Record<DealStage, number>>> = {
  prospect: 0.05,
  outreach: 0.1,
  conversation: 0.25,
  pitched: 0.4,
  negotiating: 0.6,
} as const;

/** Stages counted as already-committed revenue. */
const COMMITTED_STAGES: readonly DealStage[] = [
  "committed",
  "fulfilling",
  "renewed",
] as const;

export interface RevenueSummary {
  cycle: string;
  /** sum of askAmount for committed/fulfilling/renewed deals */
  committedTotal: number;
  /** sum of askAmount * STAGE_WEIGHTS[stage] for weighted stages */
  weightedPipeline: number;
  /** revenue_goal setting as a number (0 when unset) */
  goal: number;
  /** deals at committed+ whose target tier is the active top-priced tier */
  anchorCount: number;
  /** anchor_target setting as a number (0 when unset) */
  anchorTarget: number;
  /** count + committed/weighted dollars per stage */
  byStage: Array<{
    stage: DealStage;
    count: number;
    committed: number;
    weighted: number;
  }>;
  /** count + committed/weighted dollars per company type */
  byType: Array<{
    type: CompanyType;
    count: number;
    committed: number;
    weighted: number;
  }>;
}

/**
 * Money dashboard aggregate for one cycle. "Committed" sums the ask amounts of
 * committed/fulfilling/renewed deals; "weighted pipeline" applies STAGE_WEIGHTS
 * to earlier-stage ask amounts. The anchor count is the number of committed+
 * deals targeting the active top-priced tier (the Gold anchor).
 */
export async function revenueSummary(cycle: string): Promise<RevenueSummary> {
  const rows = await db
    .select({ deal: deals, company: companies })
    .from(deals)
    .innerJoin(companies, eq(deals.companyId, companies.id))
    .where(eq(deals.cycle, cycle))
    .all();

  // The active top-priced tier is the anchor (Gold) tier.
  const activeTiers = await db
    .select()
    .from(tiers)
    .where(eq(tiers.active, true))
    .orderBy(desc(tiers.price))
    .all();
  const anchorTierId = activeTiers[0]?.id ?? null;

  let committedTotal = 0;
  let weightedPipeline = 0;
  let anchorCount = 0;

  const stageAgg = new Map<
    DealStage,
    { count: number; committed: number; weighted: number }
  >();
  const typeAgg = new Map<
    CompanyType,
    { count: number; committed: number; weighted: number }
  >();

  for (const { deal, company } of rows) {
    const stage = deal.stage as DealStage;
    const ask = deal.askAmount ?? 0;
    const isCommitted = (COMMITTED_STAGES as DealStage[]).includes(stage);
    const stageWeight = STAGE_WEIGHTS[stage] ?? 0;
    const committedPart = isCommitted ? ask : 0;
    const weightedPart = isCommitted ? 0 : ask * stageWeight;

    committedTotal += committedPart;
    weightedPipeline += weightedPart;

    if (
      isCommitted &&
      anchorTierId != null &&
      deal.targetTierId === anchorTierId
    ) {
      anchorCount += 1;
    }

    const s = stageAgg.get(stage) ?? { count: 0, committed: 0, weighted: 0 };
    s.count += 1;
    s.committed += committedPart;
    s.weighted += weightedPart;
    stageAgg.set(stage, s);

    const type = company.type as CompanyType;
    const t = typeAgg.get(type) ?? { count: 0, committed: 0, weighted: 0 };
    t.count += 1;
    t.committed += committedPart;
    t.weighted += weightedPart;
    typeAgg.set(type, t);
  }

  const goal = Number((await getSetting("revenue_goal")) ?? "0") || 0;
  const anchorTarget = Number((await getSetting("anchor_target")) ?? "0") || 0;

  return {
    cycle,
    committedTotal,
    weightedPipeline: Math.round(weightedPipeline),
    goal,
    anchorCount,
    anchorTarget,
    byStage: [...stageAgg.entries()].map(([stage, v]) => ({ stage, ...v })),
    byType: [...typeAgg.entries()].map(([type, v]) => ({ type, ...v })),
  };
}

// ===========================================================================
// Conversion funnel + goal forecast
// ===========================================================================

/**
 * The forward pipeline stages the funnel walks, prospect through committed.
 * Terminal/holding stages (fulfilling/renewed/lapsed) are not funnel steps -
 * committed is the "won" endpoint the forecast projects toward.
 */
const FUNNEL_STAGES: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
] as const;

/**
 * A sensible default prospect -> committed conversion rate used when the
 * stage-event history is too thin to be trustworthy (fewer than
 * FORECAST_MIN_HISTORY prospects have entered the funnel). Roughly: a well-run
 * cold B2B sponsorship pipeline converts a low single-digit percentage of raw
 * prospects into signed deals.
 */
export const DEFAULT_PROSPECT_TO_COMMITTED_RATE = 0.04;

/** Below this many historical prospect entries, we fall back to the default rate. */
export const FORECAST_MIN_HISTORY = 25;

export interface FunnelStageStat {
  stage: DealStage;
  /** distinct deals that ever entered this stage (from stage_events) */
  entered: number;
  /** distinct deals that ever reached the NEXT funnel stage */
  advanced: number;
  /** advanced / entered, 0 when nothing entered */
  conversionToNext: number;
}

export interface FunnelForecast {
  cycle: string;
  /** per-stage entry counts and stage-to-stage conversion, prospect..committed */
  stages: FunnelStageStat[];
  /** distinct deals that ever entered prospect (funnel top) */
  prospectsEntered: number;
  /** distinct deals that ever reached committed (funnel bottom) */
  committedReached: number;
  /** historical prospect -> committed rate from the log */
  observedRate: number;
  /** the rate actually used for the forecast (observed, or the default when thin) */
  effectiveRate: number;
  /** true when effectiveRate fell back to the default because history is thin */
  usedDefaultRate: boolean;
  /** average ask on committed-and-beyond deals in the cycle (0 when none) */
  avgCommittedAsk: number;
  /** startable prospects available now (cold pool size) */
  startablePool: number;
  /** committed dollars already booked this cycle */
  committedTotal: number;
  /** projected additional dollars from converting the startable pool */
  forecastFromPool: number;
  /** committedTotal + forecastFromPool */
  projectedTotal: number;
  /** revenue goal for the cycle (0 when unset) */
  goal: number;
  /** goal - projectedTotal, clamped at 0 (dollars still short after the pool) */
  shortfall: number;
  /** more prospects that must enter the funnel to close the shortfall (0 when none) */
  prospectsNeededForShortfall: number;
}

/**
 * Conversion funnel and goal forecast for one cycle. It reads the stage-event
 * log (written by recordStageEvent on every stage change) to count how many
 * distinct deals ever entered each funnel stage and the stage-to-stage
 * conversion rate, then forecasts revenue from the startable prospect pool:
 *
 *   forecast = startablePool x prospect->committed rate x avg committed ask
 *
 * The prospect->committed rate is observed from the log, but when history is
 * thin (< FORECAST_MIN_HISTORY prospects entered) it falls back to a sensible
 * default so an empty log does not read as "0% chance". The shortfall and the
 * "N more prospects into conversation" readout turn the revenue goal into a
 * concrete prospecting quota.
 */
export async function funnelForecast(cycle: string): Promise<FunnelForecast> {
  // Deals in this cycle, so the funnel counts only the cycle's history. A deal's
  // stage events all belong to the cycle the deal is in.
  const cycleDealRows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.cycle, cycle))
    .all();
  const cycleDealIds = new Set(cycleDealRows.map((r) => r.id));

  // Distinct deals that ever entered each stage, from the stage-event log.
  const enteredByStage = new Map<DealStage, Set<number>>();
  if (cycleDealIds.size > 0) {
    const events = await db
      .select({ dealId: stageEvents.dealId, toStage: stageEvents.toStage })
      .from(stageEvents)
      .all();
    for (const e of events) {
      if (!cycleDealIds.has(e.dealId)) continue;
      const stage = e.toStage as DealStage;
      let set = enteredByStage.get(stage);
      if (!set) {
        set = new Set<number>();
        enteredByStage.set(stage, set);
      }
      set.add(e.dealId);
    }
  }

  const enteredCount = (s: DealStage): number =>
    enteredByStage.get(s)?.size ?? 0;

  const stages: FunnelStageStat[] = FUNNEL_STAGES.map((stage, i) => {
    const entered = enteredCount(stage);
    const next = FUNNEL_STAGES[i + 1];
    const advanced = next != null ? enteredCount(next) : entered;
    return {
      stage,
      entered,
      advanced,
      conversionToNext: entered > 0 && next != null ? advanced / entered : 0,
    };
  });

  const prospectsEntered = enteredCount("prospect");
  const committedReached = enteredCount("committed");
  const observedRate =
    prospectsEntered > 0 ? committedReached / prospectsEntered : 0;
  const usedDefaultRate = prospectsEntered < FORECAST_MIN_HISTORY;
  const effectiveRate = usedDefaultRate
    ? DEFAULT_PROSPECT_TO_COMMITTED_RATE
    : observedRate;

  // Average ask on committed-and-beyond deals in the cycle, used as the dollar
  // value of a converted prospect. Falls back to the top active tier price, then
  // to the revenue goal spread over the anchor target, then to 0.
  const committedDeals = await db
    .select({ ask: deals.askAmount })
    .from(deals)
    .where(
      and(
        eq(deals.cycle, cycle),
        inArray(deals.stage, COMMITTED_STAGES as DealStage[]),
      ),
    )
    .all();
  const committedAsks = committedDeals
    .map((d) => d.ask ?? 0)
    .filter((a) => a > 0);
  let avgCommittedAsk =
    committedAsks.length > 0
      ? committedAsks.reduce((s, a) => s + a, 0) / committedAsks.length
      : 0;
  if (avgCommittedAsk === 0) {
    const topTier = await db
      .select({ price: tiers.price })
      .from(tiers)
      .where(eq(tiers.active, true))
      .orderBy(desc(tiers.price))
      .get();
    avgCommittedAsk = topTier?.price ?? 0;
  }

  const startablePool = (await listProspectPool()).length;
  const summary = await revenueSummary(cycle);
  const committedTotal = summary.committedTotal;
  const goal = summary.goal;

  const forecastFromPool = Math.round(
    startablePool * effectiveRate * avgCommittedAsk,
  );
  const projectedTotal = committedTotal + forecastFromPool;
  const shortfall = Math.max(0, goal - projectedTotal);

  // How many more prospects must enter the funnel to close the shortfall: each
  // prospect is worth effectiveRate x avgCommittedAsk expected dollars.
  const dollarsPerProspect = effectiveRate * avgCommittedAsk;
  const prospectsNeededForShortfall =
    shortfall > 0 && dollarsPerProspect > 0
      ? Math.ceil(shortfall / dollarsPerProspect)
      : 0;

  return {
    cycle,
    stages,
    prospectsEntered,
    committedReached,
    observedRate,
    effectiveRate,
    usedDefaultRate,
    avgCommittedAsk: Math.round(avgCommittedAsk),
    startablePool,
    committedTotal,
    forecastFromPool,
    projectedTotal,
    goal,
    shortfall,
    prospectsNeededForShortfall,
  };
}

// ===========================================================================
// Discord inbox
// ===========================================================================

export interface DiscordInboxInput {
  discordMessageId: string;
  channelName?: string | null;
  author?: string | null;
  content?: string | null;
  postedAt?: string | null;
}

/**
 * Bulk-insert captured Discord messages, ignoring any whose discordMessageId is
 * already present (dedupe by the unique natural key). Returns how many rows were
 * actually inserted.
 */
export async function insertDiscordInboxMessages(
  batch: DiscordInboxInput[],
  actorUserId: number | null = null,
): Promise<number> {
  if (!batch.length) return 0;
  const now = nowIso();
  const values: NewDiscordInboxMessage[] = batch.map((m) => ({
    discordMessageId: m.discordMessageId,
    channelName: m.channelName ?? null,
    author: m.author ?? null,
    content: m.content ?? null,
    postedAt: m.postedAt ?? null,
    status: "pending" as DiscordInboxStatus,
    attachedCompanyId: null,
    createdAt: now,
  }));
  const inserted = await db
    .insert(discordInbox)
    .values(values)
    .onConflictDoNothing({ target: discordInbox.discordMessageId })
    .returning()
    .all();
  for (const row of inserted) {
    await logAudit(actorUserId, "discord_inbox", row.id, "insert", row);
  }
  return inserted.length;
}

export async function listDiscordInbox(
  status?: DiscordInboxStatus,
): Promise<DiscordInboxMessage[]> {
  return await db
    .select()
    .from(discordInbox)
    .where(status ? eq(discordInbox.status, status) : undefined)
    .orderBy(desc(discordInbox.postedAt), desc(discordInbox.createdAt))
    .all();
}

/**
 * Attach an inbox message to a company: flip its status to 'attached', record
 * the company, and optionally log an inbound Discord touchpoint on that company.
 */
export async function attachInboxMessageToCompany(
  inboxId: number,
  companyId: number,
  alsoLogTouchpoint: boolean,
  actorUserId: number | null = null,
): Promise<DiscordInboxMessage | null> {
  const row = await db
    .update(discordInbox)
    .set({ status: "attached", attachedCompanyId: companyId })
    .where(eq(discordInbox.id, inboxId))
    .returning()
    .get();
  if (!row) return null;
  await logAudit(actorUserId, "discord_inbox", row.id, "update", row);

  if (alsoLogTouchpoint) {
    await logTouchpoint(
      {
        companyId,
        channel: "discord",
        direction: "inbound",
        occurredAt: row.postedAt ?? nowIso(),
        summary: row.content
          ? `Discord${row.author ? ` from ${row.author}` : ""}: ${row.content}`
          : "Attached Discord message",
      },
      actorUserId,
    );
  }

  return row;
}

export interface TriageResult {
  message: DiscordInboxMessage;
  dealId: number;
  /** true when a fresh current-cycle deal had to be created */
  createdDeal: boolean;
  /** true when the deal's stage was nudged forward to conversation */
  advancedStage: boolean;
  /** true when the "Reply to inbound interest" action was created */
  createdAction: boolean;
}

/**
 * One-click triage of an interested Discord message into an armed deal:
 *
 *   1. Attach the message to the company and log the inbound Discord touchpoint
 *      (this runs the cadence inbound handoff: close cadence actions + detach).
 *   2. Ensure the company has a deal in the current cycle, creating one at the
 *      conversation stage if it has none.
 *   3. Nudge an existing deal's stage forward to at least conversation (never
 *      regressing a deal already further along).
 *   4. Create a "Reply to inbound interest" next action due in `dueInDays` days,
 *      but ONLY when the deal has no open action left - existing open actions are
 *      never wiped or duplicated.
 *
 * Returns null when the inbox message does not exist.
 */
export async function triageInboxMessageToDeal(
  inboxId: number,
  companyId: number,
  dueInDays = 2,
  actorUserId: number | null = null,
): Promise<TriageResult | null> {
  const message = await attachInboxMessageToCompany(inboxId, companyId, true, actorUserId);
  if (!message) return null;

  const cycle = await getCurrentCycle();

  // Resolve (or create) the current-cycle deal for this company.
  let deal =
    (await db
      .select()
      .from(deals)
      .where(and(eq(deals.companyId, companyId), eq(deals.cycle, cycle)))
      .orderBy(desc(deals.createdAt))
      .get()) ?? null;

  let createdDeal = false;
  let advancedStage = false;
  if (!deal) {
    // No deal in this cycle - start one already at the conversation stage.
    deal = await createDeal({ companyId, cycle, stage: "conversation" }, actorUserId);
    createdDeal = true;
    advancedStage = true;
  } else {
    // Nudge forward to at least conversation, never regressing further-along deals.
    const currentIdx = STAGE_ORDER.indexOf(deal.stage as DealStage);
    const conversationIdx = STAGE_ORDER.indexOf("conversation");
    if (currentIdx !== -1 && currentIdx < conversationIdx) {
      await updateDealStage(deal.id, "conversation", actorUserId);
      advancedStage = true;
    }
  }

  // Create the reply action only when nothing is open (never wipe/duplicate).
  const open = await db
    .select({ id: nextActions.id })
    .from(nextActions)
    .where(and(eq(nextActions.dealId, deal.id), eq(nextActions.status, "open")))
    .get();

  let createdAction = false;
  if (!open) {
    await createNextAction(
      {
        dealId: deal.id,
        title: "Reply to inbound interest",
        dueDate: formatISO(addDays(new Date(), dueInDays), {
          representation: "date",
        }),
        createdBy: "manual",
      },
      actorUserId,
    );
    createdAction = true;
  }

  return {
    message,
    dealId: deal.id,
    createdDeal,
    advancedStage,
    createdAction,
  };
}

/** Mark an inbox message dismissed (irrelevant / handled without attaching). */
export async function dismissInboxMessage(
  inboxId: number,
  actorUserId: number | null = null,
): Promise<DiscordInboxMessage | null> {
  const row = await db
    .update(discordInbox)
    .set({ status: "dismissed" })
    .where(eq(discordInbox.id, inboxId))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "discord_inbox", row.id, "update", row);
  return row ?? null;
}

// ===========================================================================
// Contact inbox (scraped contacts awaiting keep/reject triage)
// ===========================================================================

export interface ContactInboxIngestResult {
  /** rows newly staged as pending */
  added: number;
  /** rows skipped because their dedupe key already exists (any status) */
  duplicates: number;
}

/**
 * Stage scraped people into the contact inbox as pending rows, deduped on the
 * natural key (normalized LinkedIn URL, else name|company). Rows whose key is
 * already present - pending or decided - are skipped, so re-pasting an
 * overlapping scrape is a no-op and rejected people never resurface.
 */
export async function ingestContactInbox(
  people: ScrapedPerson[],
  meta: { source?: string | null; scrapedAt?: string | null } = {},
  actorUserId: number | null = null,
): Promise<ContactInboxIngestResult> {
  await ensureMigrated();
  if (!people.length) return { added: 0, duplicates: 0 };

  // Dedupe within the batch first so the result counts are exact.
  const byKey = new Map<string, ScrapedPerson>();
  for (const p of people) {
    const key = contactInboxDedupeKey(p);
    if (!byKey.has(key)) byKey.set(key, p);
  }

  const now = nowIso();
  const values = [...byKey.entries()].map(([dedupeKey, p]) => ({
    dedupeKey,
    name: p.name,
    title: p.title,
    companyName: p.company,
    linkedin: p.linkedin,
    apolloId: p.apolloId,
    source: meta.source ?? "apollo",
    scrapedAt: meta.scrapedAt ?? null,
    status: "pending" as ContactInboxStatus,
    createdAt: now,
  }));

  const inserted = await db
    .insert(contactInbox)
    .values(values)
    .onConflictDoNothing({ target: contactInbox.dedupeKey })
    .returning()
    .all();
  for (const row of inserted) {
    await logAudit(actorUserId, "contact_inbox", row.id, "insert", row);
  }
  return {
    added: inserted.length,
    duplicates: people.length - inserted.length,
  };
}

export async function listContactInbox(
  status?: ContactInboxStatus,
): Promise<ContactInboxRow[]> {
  await ensureMigrated();
  return await db
    .select()
    .from(contactInbox)
    .where(status ? eq(contactInbox.status, status) : undefined)
    .orderBy(asc(contactInbox.id))
    .all();
}

/**
 * Contact count per company, for the triage card's "has a contact" bubble and
 * the "no contact yet" filter. Companies with zero contacts are simply absent
 * from the map - callers default to 0.
 */
export async function contactCountByCompany(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      companyId: contacts.companyId,
      contactCount: sql<number>`count(*)`.as("contact_count"),
    })
    .from(contacts)
    .groupBy(contacts.companyId)
    .all();
  return new Map(rows.map((r) => [r.companyId, Number(r.contactCount)]));
}

/**
 * Company ids someone has already reached out to - at least one OUTBOUND
 * touchpoint. Inbound-only companies (they contacted us) still count as
 * un-reached, since the triage question is "have we sent anything yet".
 */
export async function companyIdsWithOutboundTouch(): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ companyId: touchpoints.companyId })
    .from(touchpoints)
    .where(eq(touchpoints.direction, "outbound"))
    .all();
  return new Set(rows.map((r) => r.companyId));
}

/** Company ids that have at least one deal in the rejected stage (any cycle). */
export async function companyIdsWithRejectedDeals(): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ companyId: deals.companyId })
    .from(deals)
    .where(eq(deals.stage, "rejected"))
    .all();
  return new Set(rows.map((r) => r.companyId));
}

/**
 * Current-cycle deal stage per company (latest deal wins when a company has
 * more than one). Lets the triage card warn "active deal in conversation"
 * before a keep crosses wires with an in-flight thread.
 */
export async function currentCycleDealStageByCompany(): Promise<
  Map<number, DealStage>
> {
  const cycle = await getCurrentCycle();
  const rows = await db
    .select({ companyId: deals.companyId, stage: deals.stage })
    .from(deals)
    .where(eq(deals.cycle, cycle))
    .orderBy(asc(deals.createdAt))
    .all();
  const byCompany = new Map<number, DealStage>();
  for (const r of rows) byCompany.set(r.companyId, r.stage as DealStage);
  return byCompany;
}

export interface KeepContactResult {
  row: ContactInboxRow;
  contactId: number;
  companyId: number;
  companyName: string;
  /** true when no company matched and one was created */
  createdCompany: boolean;
  /** true when a prospect deal was opened for a created company */
  createdDeal: boolean;
  /** true when an existing contact matched instead of creating a duplicate */
  reusedContact: boolean;
}

/**
 * Keep a pending inbox row: attach it to the company it names and create the
 * real contact.
 *
 *   - Company match is on normalized name. When nothing matches, a new company
 *     is created (source cold_research) with a prospect-stage deal in the
 *     current cycle - a kept contact at a brand-new company IS a net-new
 *     prospect. An existing company's deals are never touched, so keeping a
 *     contact at a company with a rejected deal adds the person without
 *     re-arming the company (the rejected-stage rule).
 *   - If the company already has a contact with the same LinkedIn profile or
 *     the same name, that contact is reused instead of duplicated.
 *   - Campus-facing titles get category university_relations; others stay null.
 *
 * Returns null when the row is missing, not pending, or names no company.
 */
export async function keepInboxContact(
  inboxId: number,
  actorUserId: number | null = null,
): Promise<KeepContactResult | null> {
  const row = await db
    .select()
    .from(contactInbox)
    .where(eq(contactInbox.id, inboxId))
    .get();
  if (!row || row.status !== "pending" || !row.companyName) return null;

  let company = await findCompanyByNormalizedName(row.companyName);
  let createdCompany = false;
  let createdDeal = false;
  if (!company) {
    company = await createCompany(
      { name: row.companyName, type: "corporate", source: "cold_research" },
      actorUserId,
    );
    createdCompany = true;
    await createDeal(
      { companyId: company.id, cycle: await getCurrentCycle(), stage: "prospect" },
      actorUserId,
    );
    createdDeal = true;
  }

  // Reuse an existing contact on this company rather than duplicating.
  const companyContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, company.id))
    .all();
  const linkedinKey = row.linkedin?.toLowerCase().replace(/\/+$/, "") ?? null;
  const existing = companyContacts.find(
    (c) =>
      (linkedinKey &&
        c.linkedin &&
        c.linkedin.toLowerCase().replace(/\/+$/, "") === linkedinKey) ||
      c.name.toLowerCase() === row.name.toLowerCase(),
  );

  let contactId: number;
  if (existing) {
    contactId = existing.id;
  } else {
    const campusFacing = suggestTriage(row.title)?.suggestion === "keep";
    const contact = await createContact(
      {
        companyId: company.id,
        name: row.name,
        role: row.title,
        linkedin: row.linkedin,
        sourcedFrom: row.source,
        category: campusFacing ? "university_relations" : null,
      },
      actorUserId,
    );
    contactId = contact.id;
  }

  const updated = await db
    .update(contactInbox)
    .set({
      status: "kept",
      contactId,
      companyId: company.id,
      decidedAt: nowIso(),
      decisionKind: "keep",
      triageCreatedContact: !existing,
    })
    .where(eq(contactInbox.id, inboxId))
    .returning()
    .get();
  await logAudit(actorUserId, "contact_inbox", inboxId, "update", updated);

  return {
    row: updated,
    contactId,
    companyId: company.id,
    companyName: company.name,
    createdCompany,
    createdDeal,
    reusedContact: !!existing,
  };
}

/** Name of the seeded LinkedIn cadence used by "Keep + DM'd" triage. */
export const LINKEDIN_CADENCE_NAME = "LinkedIn outreach";

/**
 * Find-or-create the LinkedIn outreach cadence: max two LinkedIn touches, then
 * switch channels to email (a third DM is spam; if two didn't land the channel
 * is the problem, not the timing). Step 1 IS the intro DM - "Keep + DM'd"
 * assigns the cadence with the step index already past it.
 */
async function ensureLinkedinCadence(
  actorUserId: number | null,
): Promise<number> {
  const existing = await db
    .select()
    .from(cadences)
    .where(eq(cadences.name, LINKEDIN_CADENCE_NAME))
    .get();
  if (existing) return existing.id;

  const cadence = await createCadence(
    {
      name: LINKEDIN_CADENCE_NAME,
      description:
        "Cold LinkedIn DM sequence: intro DM (step 1, logged by triage's Keep + DM'd), one bump ~a week later (connection acceptance lags), then switch to email rather than sending a third DM.",
    },
    actorUserId,
  );
  await setCadenceSteps(
    cadence.id,
    [
      { position: 1, waitDays: 0, channel: "linkedin", note: "intro DM" },
      {
        position: 2,
        waitDays: 6,
        channel: "linkedin",
        note: "one polite bump / check connection accepted",
      },
      {
        position: 3,
        waitDays: 7,
        channel: "email",
        note: "switch channels: email referencing the DM",
      },
      { position: 4, waitDays: 8, channel: "email", note: "final follow-up" },
    ],
    actorUserId,
  );
  return cadence.id;
}

export interface KeepAndMessageResult extends KeepContactResult {
  dealId: number;
  /** true when the deal moved (or was created) into the outreach stage */
  advancedToOutreach: boolean;
  /** true when the LinkedIn cadence was assigned (deal had none) */
  assignedCadence: boolean;
  /** due date of the scheduled follow-up action, when one was created */
  followUpDue: string | null;
}

export interface KeepAndMessageOptions {
  touchType?: LinkedinTouchType;
  note?: string | null;
}

function linkedinTouchSummary(
  name: string,
  touchType: LinkedinTouchType,
  note?: string | null,
): string {
  const action =
    touchType === "connection_request"
      ? "LinkedIn connection request"
      : "LinkedIn intro DM";
  return `${action} to ${name} (from triage)${note ? ` - ${note}` : ""}`;
}

/**
 * Keep a pending inbox row AND record that a LinkedIn DM was just sent (the
 * triage "M" decision - contact verified on LinkedIn and messaged then and
 * there). On top of keepInboxContact():
 *
 *   1. Ensure a current-cycle deal exists (created at prospect by keep for
 *      net-new companies; created here for existing companies without one).
 *   2. Assign the LinkedIn cadence when the deal has none, with the step index
 *      already past step 1 - the DM IS step 1, so the engine schedules the
 *      +6d bump, not a "send the DM" action for a DM already sent.
 *   3. Log the outbound linkedin touchpoint (this runs the cadence engine,
 *      which schedules the next step's action).
 *   4. Nudge the stage forward to outreach - AFTER the cadence action exists,
 *      so armNextActionForStage sees an open action and never duplicates.
 *      Deals already at outreach or beyond are never regressed.
 */
export async function keepAndMessageInboxContact(
  inboxId: number,
  actorUserId: number | null = null,
  options: KeepAndMessageOptions = {},
): Promise<KeepAndMessageResult | null> {
  const candidate = await db
    .select({ status: contactInbox.status, companyName: contactInbox.companyName })
    .from(contactInbox)
    .where(eq(contactInbox.id, inboxId))
    .get();
  if (!candidate || candidate.status !== "pending" || !candidate.companyName) {
    return null;
  }

  const linkedinCadenceId = await ensureLinkedinCadence(actorUserId);
  const cycle = await getCurrentCycle();
  const touchType = options.touchType ?? "dm";
  const note = options.note?.trim() || null;

  return db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(contactInbox)
      .where(eq(contactInbox.id, inboxId))
      .get();
    if (!row || row.status !== "pending" || !row.companyName) return null;

    let company =
      (await tx
        .select()
        .from(companies)
        .where(
          eq(companies.normalizedName, normalizeCompanyName(row.companyName)),
        )
        .get()) ?? null;
    let createdCompany = false;
    let createdDeal = false;
    if (!company) {
      company = await tx
        .insert(companies)
        .values({
          name: row.companyName,
          normalizedName: normalizeCompanyName(row.companyName),
          type: "corporate",
          priority: "medium",
          source: "cold_research",
        })
        .returning()
        .get();
      await logAudit(
        actorUserId,
        "companies",
        company.id,
        "insert",
        company,
        tx,
      );
      createdCompany = true;
    }

    const companyContacts = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.companyId, company.id))
      .all();
    const linkedinKey = row.linkedin?.toLowerCase().replace(/\/+$/, "") ?? null;
    const existing = companyContacts.find(
      (contact) =>
        (linkedinKey &&
          contact.linkedin &&
          contact.linkedin.toLowerCase().replace(/\/+$/, "") === linkedinKey) ||
        contact.name.toLowerCase() === row.name.toLowerCase(),
    );
    let contactId = existing?.id ?? null;
    if (contactId == null) {
      const campusFacing = suggestTriage(row.title)?.suggestion === "keep";
      const contact = await tx
        .insert(contacts)
        .values({
          companyId: company.id,
          name: row.name,
          role: row.title,
          linkedin: row.linkedin,
          sourcedFrom: row.source,
          warmth: "cold",
          contactType: "unknown",
          category: campusFacing ? "university_relations" : null,
        })
        .returning()
        .get();
      await logAudit(
        actorUserId,
        "contacts",
        contact.id,
        "insert",
        contact,
        tx,
      );
      contactId = contact.id;
    }

    let deal =
      (await tx
        .select()
        .from(deals)
        .where(and(eq(deals.companyId, company.id), eq(deals.cycle, cycle)))
        .orderBy(desc(deals.createdAt))
        .get()) ?? null;
    if (!deal) {
      const at = nowIso();
      deal = await tx
        .insert(deals)
        .values({
          companyId: company.id,
          cycle,
          stage: "prospect",
          cadenceStepIndex: 0,
          stageEnteredAt: at,
          createdAt: at,
        })
        .returning()
        .get();
      await logAudit(actorUserId, "deals", deal.id, "insert", deal, tx);
      await recordStageEvent(
        deal.id,
        null,
        "prospect",
        tx,
        at,
        actorUserId,
      );
      createdDeal = true;
    }

    const openBefore = await tx
      .select({ id: nextActions.id })
      .from(nextActions)
      .where(
        and(
          eq(nextActions.dealId, deal.id),
          eq(nextActions.status, "open"),
        ),
      )
      .all();
    const openBeforeIds = new Set(openBefore.map((action) => action.id));

    const previousCadenceStepIndex =
      deal.cadenceId === linkedinCadenceId ? deal.cadenceStepIndex : null;
    let assignedCadence = false;
    if (deal.cadenceId == null) {
      const updated = await tx
        .update(deals)
        .set({ cadenceId: linkedinCadenceId, cadenceStepIndex: 1 })
        .where(eq(deals.id, deal.id))
        .returning()
        .get();
      await logAudit(actorUserId, "deals", deal.id, "update", updated, tx);
      deal = updated;
      assignedCadence = true;
    } else if (
      deal.cadenceId === linkedinCadenceId &&
      deal.cadenceStepIndex === 0
    ) {
      // The triage touch is cadence step 1, so schedule step 2 next.
      const updated = await tx
        .update(deals)
        .set({ cadenceStepIndex: 1 })
        .where(eq(deals.id, deal.id))
        .returning()
        .get();
      await logAudit(actorUserId, "deals", deal.id, "update", updated, tx);
      deal = updated;
    }

    const touchpoint = await tx
      .insert(touchpoints)
      .values({
        companyId: company.id,
        dealId: deal.id,
        contactId,
        channel: "linkedin",
        direction: "outbound",
        occurredAt: nowIso(),
        summary: linkedinTouchSummary(row.name, touchType, note),
      })
      .returning()
      .get();
    await logAudit(
      actorUserId,
      "touchpoints",
      touchpoint.id,
      "insert",
      touchpoint,
      tx,
    );
    await advanceCadenceAfterTouchpoint(
      deal.id,
      "outbound",
      actorUserId,
      "linkedin",
      tx,
    );

    let advancedToOutreach = false;
    const previousStage = deal.stage as DealStage;
    const currentIdx = STAGE_ORDER.indexOf(previousStage);
    const outreachIdx = STAGE_ORDER.indexOf("outreach");
    if (currentIdx !== -1 && currentIdx < outreachIdx) {
      const at = nowIso();
      const updated = await tx
        .update(deals)
        .set({ stage: "outreach", stageEnteredAt: at })
        .where(eq(deals.id, deal.id))
        .returning()
        .get();
      await logAudit(actorUserId, "deals", deal.id, "update", updated, tx);
      await recordStageEvent(
        deal.id,
        previousStage,
        "outreach",
        tx,
        at,
        actorUserId,
      );
      await armNextActionForStage(deal.id, "outreach", tx, actorUserId);
      advancedToOutreach = true;
    }

    const openAfter = await tx
      .select()
      .from(nextActions)
      .where(
        and(
          eq(nextActions.dealId, deal.id),
          eq(nextActions.status, "open"),
        ),
      )
      .orderBy(desc(nextActions.id))
      .all();
    const triageAction =
      openAfter.find((action) => !openBeforeIds.has(action.id)) ?? null;
    const followUp =
      openAfter.find((action) => action.createdBy === "cadence") ?? null;

    const updatedRow = await tx
      .update(contactInbox)
      .set({
        status: "kept",
        contactId,
        companyId: company.id,
        decidedAt: nowIso(),
        decisionKind: "linkedin",
        triageCreatedContact: !existing,
        triageTouchpointId: touchpoint.id,
        triageDealId: deal.id,
        triageAssignedCadence: assignedCadence,
        triagePreviousCadenceStepIndex: previousCadenceStepIndex,
        triagePreviousStage: advancedToOutreach ? previousStage : null,
        triageNextActionId: triageAction?.id ?? null,
        linkedinTouchType: touchType,
        linkedinNote: note,
      })
      .where(
        and(eq(contactInbox.id, inboxId), eq(contactInbox.status, "pending")),
      )
      .returning()
      .get();
    if (!updatedRow) throw new Error("Triage row changed during decision");
    await logAudit(
      actorUserId,
      "contact_inbox",
      updatedRow.id,
      "update",
      updatedRow,
      tx,
    );

    return {
      row: updatedRow,
      contactId,
      companyId: company.id,
      companyName: company.name,
      createdCompany,
      createdDeal,
      reusedContact: !!existing,
      dealId: deal.id,
      advancedToOutreach,
      assignedCadence,
      followUpDue: followUp?.dueDate ?? null,
    };
  });
}

/** Correct the type or optional note on a LinkedIn touch created from triage. */
export async function updateTriageLinkedinTouch(
  inboxId: number,
  touchType: LinkedinTouchType,
  note: string | null,
  actorUserId: number | null = null,
): Promise<ContactInboxRow | null> {
  const cleanNote = note?.trim() || null;
  return db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(contactInbox)
      .where(eq(contactInbox.id, inboxId))
      .get();
    if (
      !row ||
      row.status !== "kept" ||
      row.decisionKind !== "linkedin" ||
      row.triageTouchpointId == null
    ) {
      return null;
    }

    const touchpoint = await tx
      .update(touchpoints)
      .set({
        summary: linkedinTouchSummary(row.name, touchType, cleanNote),
      })
      .where(eq(touchpoints.id, row.triageTouchpointId))
      .returning()
      .get();
    if (!touchpoint) return null;
    await logAudit(
      actorUserId,
      "touchpoints",
      touchpoint.id,
      "update",
      touchpoint,
      tx,
    );

    const updated = await tx
      .update(contactInbox)
      .set({ linkedinTouchType: touchType, linkedinNote: cleanNote })
      .where(eq(contactInbox.id, inboxId))
      .returning()
      .get();
    await logAudit(
      actorUserId,
      "contact_inbox",
      updated.id,
      "update",
      updated,
      tx,
    );
    return updated;
  });
}

/**
 * Undo only the outreach portion of Keep + LinkedIn. The contact stays kept.
 * If no later touch exists, also remove the triage-created action and restore
 * the prior cadence/stage. Later work is never rolled back.
 */
export async function undoTriageLinkedinTouch(
  inboxId: number,
  actorUserId: number | null = null,
): Promise<ContactInboxRow | null> {
  return db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(contactInbox)
      .where(eq(contactInbox.id, inboxId))
      .get();
    if (
      !row ||
      row.status !== "kept" ||
      row.decisionKind !== "linkedin" ||
      row.triageTouchpointId == null
    ) {
      return null;
    }

    const laterTouch =
      row.triageDealId == null
        ? null
        : await tx
            .select({ id: touchpoints.id })
            .from(touchpoints)
            .where(
              and(
                eq(touchpoints.dealId, row.triageDealId),
                gt(touchpoints.id, row.triageTouchpointId),
              ),
            )
            .get();

    const updated = await tx
      .update(contactInbox)
      .set({
        decisionKind: "keep",
        triageTouchpointId: null,
        triageDealId: null,
        triageAssignedCadence: null,
        triagePreviousCadenceStepIndex: null,
        triagePreviousStage: null,
        triageNextActionId: null,
        linkedinTouchType: null,
        linkedinNote: null,
      })
      .where(eq(contactInbox.id, inboxId))
      .returning()
      .get();
    await logAudit(
      actorUserId,
      "contact_inbox",
      updated.id,
      "update",
      updated,
      tx,
    );

    const touchpoint = await tx
      .select()
      .from(touchpoints)
      .where(eq(touchpoints.id, row.triageTouchpointId))
      .get();
    if (touchpoint) {
      await tx
        .delete(touchpoints)
        .where(eq(touchpoints.id, touchpoint.id))
        .run();
      await logAudit(
        actorUserId,
        "touchpoints",
        touchpoint.id,
        "delete",
        touchpoint,
        tx,
      );
    }

    let canRestoreDeal = !laterTouch;
    if (!laterTouch && row.triageNextActionId != null) {
      const action = await tx
        .select()
        .from(nextActions)
        .where(
          and(
            eq(nextActions.id, row.triageNextActionId),
            eq(nextActions.status, "open"),
          ),
        )
        .get();
      if (action) {
        await tx
          .delete(nextActions)
          .where(eq(nextActions.id, action.id))
          .run();
        await logAudit(
          actorUserId,
          "next_actions",
          action.id,
          "delete",
          action,
          tx,
        );
      } else {
        // A completed/deleted follow-up is later work. Remove the exact touch,
        // but do not rewind the deal underneath that work.
        canRestoreDeal = false;
      }
    }

    if (canRestoreDeal && row.triageDealId != null) {
      const deal = await tx
        .select()
        .from(deals)
        .where(eq(deals.id, row.triageDealId))
        .get();
      if (deal) {
        const linkedinCadence = await tx
          .select({ id: cadences.id })
          .from(cadences)
          .where(eq(cadences.name, LINKEDIN_CADENCE_NAME))
          .get();
        const patch: Partial<Deal> = {};
        if (
          row.triageAssignedCadence &&
          deal.cadenceId === linkedinCadence?.id
        ) {
          patch.cadenceId = null;
          patch.cadenceStepIndex = 0;
        } else if (
          row.triagePreviousCadenceStepIndex != null &&
          deal.cadenceId === linkedinCadence?.id
        ) {
          patch.cadenceStepIndex = row.triagePreviousCadenceStepIndex;
        }
        if (
          row.triagePreviousStage &&
          deal.stage === "outreach" &&
          STAGE_ORDER.includes(row.triagePreviousStage as DealStage)
        ) {
          patch.stage = row.triagePreviousStage as DealStage;
          patch.stageEnteredAt = nowIso();
          const event = await tx
            .select()
            .from(stageEvents)
            .where(
              and(
                eq(stageEvents.dealId, deal.id),
                eq(stageEvents.fromStage, row.triagePreviousStage),
                eq(stageEvents.toStage, "outreach"),
              ),
            )
            .orderBy(desc(stageEvents.id))
            .get();
          if (event) {
            await tx
              .delete(stageEvents)
              .where(eq(stageEvents.id, event.id))
              .run();
            await logAudit(
              actorUserId,
              "stage_events",
              event.id,
              "delete",
              event,
              tx,
            );
          }
        }
        if (Object.keys(patch).length > 0) {
          const restored = await tx
            .update(deals)
            .set(patch)
            .where(eq(deals.id, deal.id))
            .returning()
            .get();
          await logAudit(
            actorUserId,
            "deals",
            restored.id,
            "update",
            restored,
            tx,
          );
        }
      }
    }

    return updated;
  });
}

/** Reject a pending inbox row with a structured reason. */
export async function rejectInboxContact(
  inboxId: number,
  reason: string,
  actorUserId: number | null = null,
): Promise<ContactInboxRow | null> {
  const row = await db
    .update(contactInbox)
    .set({
      status: "rejected",
      rejectReason: normalizeRejectReason(reason),
      decidedAt: nowIso(),
    })
    .where(
      and(eq(contactInbox.id, inboxId), eq(contactInbox.status, "pending")),
    )
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "contact_inbox", row.id, "update", row);
  return row ?? null;
}

export interface UndoKeepResult {
  row: ContactInboxRow;
  /** true when the contact this keep created was removed with it */
  removedContact: boolean;
  /** set when a contact was left behind, explaining why (for the feedback line) */
  keptContactBecause: "reused" | "unknown_origin" | "has_history" | null;
}

/**
 * Undo a keep: send the row back to pending and remove the contact that keep
 * created. Refuses while the row still carries a triage LinkedIn touch - undo
 * the outreach first, so the touchpoint/cadence/stage rollback stays in the one
 * place that knows how to do it.
 *
 * The contact is only removed when triage created it (triageCreatedContact) AND
 * nothing has since attached to it: no touchpoints, no other inbox row, not a
 * referrer, not a deal champion. Anything else is real work, so the contact
 * stays and the caller reports why. The company and any deal keep created are
 * deliberately left alone - a company in the tracker with no contacts is an
 * ordinary prospect, not debris.
 */
export async function undoKeepInboxContact(
  inboxId: number,
  actorUserId: number | null = null,
): Promise<UndoKeepResult | null> {
  return db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(contactInbox)
      .where(eq(contactInbox.id, inboxId))
      .get();
    if (!row || row.status !== "kept" || row.triageTouchpointId != null) {
      return null;
    }

    let keptContactBecause: UndoKeepResult["keptContactBecause"] = null;
    let doomedContact: Contact | null = null;
    if (row.contactId != null) {
      if (row.triageCreatedContact === false) {
        keptContactBecause = "reused";
      } else if (row.triageCreatedContact == null) {
        keptContactBecause = "unknown_origin";
      } else {
        const [touched, otherInbox, referrer, champion] = await Promise.all([
          tx
            .select({ id: touchpoints.id })
            .from(touchpoints)
            .where(eq(touchpoints.contactId, row.contactId))
            .get(),
          tx
            .select({ id: contactInbox.id })
            .from(contactInbox)
            .where(
              and(
                eq(contactInbox.contactId, row.contactId),
                sql`${contactInbox.id} <> ${inboxId}`,
              ),
            )
            .get(),
          tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.referredByContactId, row.contactId))
            .get(),
          tx
            .select({ id: deals.id })
            .from(deals)
            .where(eq(deals.championContactId, row.contactId))
            .get(),
        ]);
        if (touched || otherInbox || referrer || champion) {
          keptContactBecause = "has_history";
        } else {
          doomedContact =
            (await tx
              .select()
              .from(contacts)
              .where(eq(contacts.id, row.contactId))
              .get()) ?? null;
        }
      }
    }

    // The inbox row's own contact_id is a foreign key, so it has to let go of
    // the contact before the contact can be deleted.
    const updated = await tx
      .update(contactInbox)
      .set({
        status: "pending",
        contactId: null,
        companyId: null,
        decidedAt: null,
        decisionKind: null,
        rejectReason: null,
        triageCreatedContact: null,
      })
      .where(eq(contactInbox.id, inboxId))
      .returning()
      .get();
    await logAudit(
      actorUserId,
      "contact_inbox",
      updated.id,
      "update",
      updated,
      tx,
    );

    if (doomedContact) {
      await tx.delete(contacts).where(eq(contacts.id, doomedContact.id)).run();
      await logAudit(
        actorUserId,
        "contacts",
        doomedContact.id,
        "delete",
        doomedContact,
        tx,
      );
    }

    return {
      row: updated,
      removedContact: doomedContact != null,
      keptContactBecause,
    };
  });
}

/**
 * Send a rejected row back to pending (undo a misclick). Kept rows go through
 * undoKeepInboxContact() instead, which also cleans up the created contact.
 */
export async function reopenInboxContact(
  inboxId: number,
  actorUserId: number | null = null,
): Promise<ContactInboxRow | null> {
  const row = await db
    .update(contactInbox)
    .set({ status: "pending", rejectReason: null, decidedAt: null })
    .where(
      and(eq(contactInbox.id, inboxId), eq(contactInbox.status, "rejected")),
    )
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "contact_inbox", row.id, "update", row);
  return row ?? null;
}

// ===========================================================================
// Discord bot heartbeat
// ===========================================================================

/**
 * Record a bot check-in. Deliberately writes the settings row directly instead
 * of going through setSetting(): this fires every few minutes forever, and an
 * audit row per beat would bury real edits under thousands of heartbeats.
 */
export async function recordBotHeartbeat(
  beat: Omit<BotHeartbeat, "at"> & { at?: string },
): Promise<BotHeartbeat> {
  const full: BotHeartbeat = { ...beat, at: beat.at ?? nowIso() };
  await db
    .insert(settings)
    .values({ key: DISCORD_BOT_HEARTBEAT_KEY, value: JSON.stringify(full) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(full) },
    })
    .run();
  return full;
}

/** The bot's last check-in, or null if it has never run against this database. */
export async function getBotHeartbeat(): Promise<BotHeartbeat | null> {
  return parseBotHeartbeat(await getSetting(DISCORD_BOT_HEARTBEAT_KEY));
}

/** The app-side pause switch, or null if it has never been toggled. */
export async function getBotPause(): Promise<BotPause | null> {
  return parseBotPause(await getSetting(DISCORD_BOT_PAUSE_KEY));
}

/**
 * Flip the bot's pause switch. Goes through setSetting so the flip lands in the
 * audit log - unlike heartbeats this is a rare, deliberate act worth recording.
 */
export async function setBotPaused(
  paused: boolean,
  actorUserId: number | null = null,
): Promise<BotPause> {
  const pause: BotPause = { paused, at: nowIso() };
  await setSetting(DISCORD_BOT_PAUSE_KEY, JSON.stringify(pause), actorUserId);
  return pause;
}

// ===========================================================================
// Users (login accounts)
// ===========================================================================

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await db.select().from(users).where(eq(users.email, email)).get();
  return row ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
  const row = await db.select().from(users).where(eq(users.id, id)).get();
  return row ?? null;
}

export interface CreateUserInput {
  email: string;
  /** Already-hashed password - this layer never sees a plaintext password. */
  passwordHash: string;
  name?: string | null;
  role?: UserRole;
  discordUserId?: string | null;
}

/** Admin-provisioned account creation (see scripts/create-user.ts). */
export async function createUser(
  input: CreateUserInput,
  actorUserId: number | null = null,
): Promise<User> {
  const row = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
      role: input.role ?? "member",
      discordUserId: input.discordUserId ?? null,
    })
    .returning()
    .get();
  await logAudit(actorUserId, "users", row.id, "insert", row);
  return row;
}

/**
 * Link (or unlink, with `discordUserId: null`) a Discord snowflake to an
 * existing account (see scripts/link-discord-user.ts). This is what lets the
 * Discord bot resolve `/log` and `/prospect` invocations back to a real user
 * for audit attribution instead of logging them as null/"system".
 */
export async function setUserDiscordId(
  userId: number,
  discordUserId: string | null,
  actorUserId: number | null = null,
): Promise<User | null> {
  const row = await db
    .update(users)
    .set({ discordUserId })
    .where(eq(users.id, userId))
    .returning()
    .get();
  if (row) await logAudit(actorUserId, "users", row.id, "update", row);
  return row ?? null;
}

/**
 * Resolve a Discord snowflake (interaction.user.id) to an app user id, so the
 * Discord bot can attribute its mutations to a real person. Returns null for
 * an unlinked Discord account - callers should fall back to null (system)
 * attribution rather than failing the command.
 */
export async function getUserIdByDiscordId(
  discordUserId: string,
): Promise<number | null> {
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.discordUserId, discordUserId))
    .get();
  return row?.id ?? null;
}

// ===========================================================================
// Audit log
//
// logAudit() is called by every mutator above after it inserts, updates, or
// deletes a row, so every change to shared data is attributable to a user (or
// null for importer/system scripts) after the fact. `state` is the row
// snapshot relevant to the action - the new row for insert/update, the row as
// it was immediately before deletion for delete - stored as JSON in whichever
// column (before/after) matches the action.
// ===========================================================================

export async function logAudit(
  actorUserId: number | null,
  tableName: string,
  rowId: string | number,
  action: AuditAction,
  state: unknown,
  executor: Pick<DataExecutor, "insert"> = db,
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

/** Most recent audit log entries, joined to the acting user's email. */
export async function listRecentAuditLog(
  limit = 200,
): Promise<Array<AuditLogEntry & { userEmail: string | null }>> {
  const rows = await db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      tableName: auditLog.tableName,
      rowId: auditLog.rowId,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      occurredAt: auditLog.occurredAt,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(limit)
    .all();
  return rows;
}

// ===========================================================================
// Re-exported enum string-union types
//
// These live in ./schema, but callers should be able to get them from the
// single data-access surface (lib/data) rather than reaching into ./schema.
// ===========================================================================
export type {
  AuditAction,
  AuditLogEntry,
  CompanyPriority,
  CompanyType,
  ContactType,
  ContactWarmth,
  Cycle,
  DealDeliverable,
  DealLostReason,
  DealSatisfaction,
  DealStage,
  DeliverableStatus,
  DeliverableTemplate,
  DiscordInboxMessage,
  DiscordInboxStatus,
  NextActionStatus,
  Setting,
  TouchpointChannel,
  TouchpointDirection,
  User,
  UserRole,
};
