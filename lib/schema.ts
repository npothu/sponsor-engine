import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";

/**
 * Sponsor Engine drizzle schema.
 *
 * SQLite (via Turso/libSQL in production, a local file in dev without Turso
 * credentials). All timestamps are stored as ISO-8601 strings (text) for easy
 * human reading and stable sorting. Money is stored as integer whole dollars
 * (no cents in this domain).
 *
 * Enum-like columns are plain text with a documented set of allowed values.
 * The data layer (lib/data.ts) is responsible for enforcing them.
 */

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

/** company.type allowed values */
export type CompanyType = "corporate" | "community";

/** company.priority allowed values (outreach ranking; high sorts first) */
export type CompanyPriority = "high" | "medium" | "low";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** normalized name for fuzzy dedupe (see app/prospects/dedupe.ts) */
  normalizedName: text("normalized_name"),
  /** bare website host for dedupe (nullable) */
  host: text("host"),
  /** 'corporate' | 'community' */
  type: text("type").notNull().default("corporate"),
  /** 'high' | 'medium' | 'low' - prospect outreach priority */
  priority: text("priority").notNull().default("medium"),
  website: text("website"),
  /** where this company came from: career fair, referral, cold list, etc. */
  source: text("source"),
  notes: text("notes"),
  /** free-form notes on why this company is (or isn't) a good sponsorship fit */
  fitNotes: text("fit_notes"),
  /** expected/target sponsorship tier for this prospect (nullable), used to
   *  weight the prospect pool by dollar potential before a deal exists */
  expectedTierId: integer("expected_tier_id").references(() => tiers.id),
  /** ISO date to re-approach this company (nullable). While in the future it is
   *  suppressed from the cold pool; on/after this date it resurfaces. Survives
   *  exec-board turnover so a "ask us in Q3" promise is never lost. */
  reAskOn: text("re_ask_on"),
  /** why we're waiting until reAskOn, e.g. "budget resets in fall" (nullable) */
  reAskReason: text("re_ask_reason"),
  /** the company's fiscal-year-end date (nullable ISO YYYY-MM-DD). Budget often
   *  has to be spent before this date, so an ask that lands after it is dead on
   *  arrival - drives the "budget windows closing soon" nudge. */
  fiscalYearEnd: text("fiscal_year_end"),
  /** import run that created/last touched this company (nullable FK) */
  importRunId: integer("import_run_id").references(() => importRuns.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Import runs (sourcing pipeline audit trail)
// ---------------------------------------------------------------------------

export const importRuns = sqliteTable("import_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  findingsFile: text("findings_file"),
  recordsWritten: integer("records_written").notNull().default(0),
});

export type ImportRun = typeof importRuns.$inferSelect;
export type NewImportRun = typeof importRuns.$inferInsert;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/** contact.warmth allowed values */
export type ContactWarmth = "cold" | "warm" | "hot";

/**
 * contact.contactType allowed values - the decision-maker role classification.
 * 'gatekeeper' screens access, 'influencer' shapes the decision, 'champion'
 * advocates internally, 'budget_holder' can actually sign; 'unknown' is the
 * default until the role is mapped.
 */
export type ContactType =
  | "unknown"
  | "gatekeeper"
  | "influencer"
  | "champion"
  | "budget_holder";

/**
 * contact.category allowed values - how this contact was sourced in the
 * prospecting pipeline (university relations desk, ERG lead, etc.).
 */
export type ContactCategory =
  | "university_relations"
  | "erg_lead"
  | "erg_officer"
  | "alum_early_career"
  | "channel_fallback";

/**
 * contact.emailStatus allowed values - confidence in the email address.
 */
export type EmailStatus = "verified" | "inferred" | "role_inbox" | "bounced";

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  /** how/where this contact was sourced */
  sourcedFrom: text("sourced_from"),
  /** 'cold' | 'warm' | 'hot' */
  warmth: text("warmth").notNull().default("cold"),
  /** decision-maker role: unknown | gatekeeper | influencer | champion | budget_holder */
  contactType: text("contact_type").notNull().default("unknown"),
  /** the contact who introduced/referred this one (nullable self-reference) */
  referredByContactId: integer("referred_by_contact_id"),
  /** sourcing pipeline category (nullable; see ContactCategory) */
  category: text("category"),
  /** email confidence signal (nullable; see EmailStatus) */
  emailStatus: text("email_status"),
  /** URL or pattern note describing where the email came from */
  emailSource: text("email_source"),
  /** import run that created this contact (nullable FK) */
  importRunId: integer("import_run_id").references(() => importRuns.id),
  notes: text("notes"),
});

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

/** deal.stage allowed values (pipeline order) */
export type DealStage =
  | "prospect"
  | "outreach"
  | "conversation"
  | "pitched"
  | "negotiating"
  | "committed"
  | "fulfilling"
  | "renewed"
  | "lapsed"
  | "rejected";

/**
 * deal.lostReason allowed values - the structured reason a deal lapsed, so a
 * successor board can re-approach timing/budget losses with context instead of a
 * free-text note. Nullable until a deal actually lapses.
 */
export type DealLostReason =
  | "budget"
  | "timing"
  | "no_response"
  | "no_fit"
  | "chose_competitor"
  | "wrong_contact"
  | "other";

/**
 * deal.satisfaction allowed values - a coarse sponsor-satisfaction signal used
 * to target renewals: 'happy' sponsors renew easily, 'at_risk' ones need
 * attention before the ask. Nullable until it is assessed.
 */
export type DealSatisfaction = "happy" | "neutral" | "at_risk";

export const deals = sqliteTable("deals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  /** sponsorship cycle string, e.g. "2026-27" */
  cycle: text("cycle").notNull(),
  /** current pipeline stage */
  stage: text("stage").notNull().default("prospect"),
  /** tier this deal is targeting (nullable) */
  targetTierId: integer("target_tier_id").references(() => tiers.id),
  /** dollar ask amount (nullable) */
  askAmount: integer("ask_amount"),
  /** free-form custom terms negotiated for this deal */
  customTerms: text("custom_terms"),
  /** structured reason this deal lapsed (nullable; see DealLostReason) */
  lostReason: text("lost_reason"),
  /** coarse sponsor-satisfaction signal (nullable; see DealSatisfaction) */
  satisfaction: text("satisfaction"),
  /** the contact who championed this deal (nullable FK to contacts) */
  championContactId: integer("champion_contact_id"),
  /** cadence assigned to drive follow-ups (nullable) */
  cadenceId: integer("cadence_id").references(() => cadences.id),
  /** index into the assigned cadence's steps */
  cadenceStepIndex: integer("cadence_step_index").notNull().default(0),
  /** when the deal entered its current stage */
  stageEnteredAt: text("stage_entered_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Stage events (per-deal stage-transition history)
// ---------------------------------------------------------------------------

/**
 * One row per stage change on a deal, written on EVERY path that mutates
 * deals.stage. This is the foundation for real conversion analytics: per-stage
 * entry counts, stage-to-stage conversion rates, and time-in-stage. fromStage is
 * null for the very first transition when the prior stage is unknown.
 */
export const stageEvents = sqliteTable("stage_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id),
  /** the stage the deal left (nullable when the prior stage is unknown) */
  fromStage: text("from_stage"),
  /** the stage the deal entered */
  toStage: text("to_stage").notNull(),
  /** ISO timestamp of the transition */
  enteredAt: text("entered_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Touchpoints (interaction log)
// ---------------------------------------------------------------------------

/** touchpoint.channel allowed values */
export type TouchpointChannel =
  | "email"
  | "call"
  | "meeting"
  | "career_fair"
  | "linkedin"
  | "discord"
  | "other";

/** touchpoint.direction allowed values */
export type TouchpointDirection = "outbound" | "inbound";

export const touchpoints = sqliteTable("touchpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  dealId: integer("deal_id").references(() => deals.id),
  contactId: integer("contact_id").references(() => contacts.id),
  /** communication channel */
  channel: text("channel").notNull().default("email"),
  /** 'outbound' | 'inbound' */
  direction: text("direction").notNull().default("outbound"),
  occurredAt: text("occurred_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  summary: text("summary"),
  outcome: text("outcome"),
  /** deck version shared/referenced in this touchpoint (nullable) */
  deckVersionId: integer("deck_version_id").references(() => deckVersions.id),
  /** template cited by this touchpoint (nullable FK), for response-rate
   *  attribution: which template earned the most replies */
  templateId: integer("template_id").references(() => templates.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Deck versions
// ---------------------------------------------------------------------------

export const deckVersions = sqliteTable("deck_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  description: text("description"),
  releasedAt: text("released_at"),
  /** shareable link to this deck/packet (nullable); {{deck_link}} merge field */
  url: text("url"),
  /** exactly one deck version should be current at a time */
  isCurrent: integer("is_current", { mode: "boolean" })
    .notNull()
    .default(false),
});

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const tiers = sqliteTable("tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** whole-dollar price */
  price: integer("price").notNull().default(0),
  description: text("description"),
  /** ordering within a package */
  position: integer("position").notNull().default(0),
  /** whether this tier is part of the active working set */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** which package/packet this tier belongs to */
  packageLabel: text("package_label"),
});

// ---------------------------------------------------------------------------
// A la carte add-ons
// ---------------------------------------------------------------------------

export const addons = sqliteTable("addons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  /** free-form pricing note (may be "quote", "included", "$X", etc.) */
  priceNote: text("price_note"),
});

export const dealAddons = sqliteTable(
  "deal_addons",
  {
    dealId: integer("deal_id")
      .notNull()
      .references(() => deals.id),
    addonId: integer("addon_id")
      .notNull()
      .references(() => addons.id),
  },
  (t) => [primaryKey({ columns: [t.dealId, t.addonId] })],
);

// ---------------------------------------------------------------------------
// Next actions (the "next action invariant")
// ---------------------------------------------------------------------------

/** next_action.status allowed values */
export type NextActionStatus = "open" | "done" | "skipped";

/** next_action.createdBy allowed values */
export type NextActionCreatedBy = "manual" | "cadence";

export const nextActions = sqliteTable("next_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull(),
  /** who owns doing this action (free-text name, nullable). The Discord bot
   *  maps owner names to Discord user IDs to @-mention people in the digest. */
  owner: text("owner"),
  /** 'open' | 'done' | 'skipped' */
  status: text("status").notNull().default("open"),
  /** 'manual' | 'cadence' */
  createdBy: text("created_by").notNull().default("manual"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  doneAt: text("done_at"),
});

// ---------------------------------------------------------------------------
// Cadences (follow-up sequences)
// ---------------------------------------------------------------------------

export const cadences = sqliteTable("cadences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
});

export const cadenceSteps = sqliteTable("cadence_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cadenceId: integer("cadence_id")
    .notNull()
    .references(() => cadences.id),
  /** ordinal position within the cadence (0-based or 1-based; data layer decides) */
  position: integer("position").notNull().default(0),
  /** days to wait after the previous step before this one fires */
  waitDays: integer("wait_days").notNull().default(0),
  /** channel for this step, mirrors TouchpointChannel values */
  channel: text("channel").notNull().default("email"),
  /** optional template to use for this step */
  templateId: integer("template_id").references(() => templates.id),
  note: text("note"),
});

// ---------------------------------------------------------------------------
// Templates (message boilerplate with merge fields)
// ---------------------------------------------------------------------------

export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** scenario label, e.g. "cold intro", "follow-up" */
  scenario: text("scenario"),
  subject: text("subject"),
  body: text("body").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Settings (single-user key/value store)
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// ---------------------------------------------------------------------------
// Cycles (sponsorship cycles, e.g. "2026-27")
// ---------------------------------------------------------------------------

export const cycles = sqliteTable("cycles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** human label and natural key, e.g. "2026-27" */
  label: text("label").notNull().unique(),
  /** the anchor event this cycle builds toward, e.g. the Spring hackathon */
  anchorEvent: text("anchor_event"),
  /** ISO date (YYYY-MM-DD) of the anchor event; powers the countdown/runway */
  anchorEventDate: text("anchor_event_date"),
  startsOn: text("starts_on"),
  endsOn: text("ends_on"),
  /** exactly one cycle should be active at a time */
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// Deliverable templates (per-tier checklist of what a sponsor gets)
// ---------------------------------------------------------------------------

export const deliverableTemplates = sqliteTable("deliverable_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tierId: integer("tier_id")
    .notNull()
    .references(() => tiers.id),
  title: text("title").notNull(),
  /** who typically owns fulfilling this deliverable */
  defaultOwner: text("default_owner"),
  /** ordering within a tier's checklist */
  position: integer("position").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Deal deliverables (concrete fulfillment items for a committed deal)
// ---------------------------------------------------------------------------

/** deal_deliverable.status allowed values */
export type DeliverableStatus = "open" | "done" | "blocked";

export const dealDeliverables = sqliteTable("deal_deliverables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealId: integer("deal_id")
    .notNull()
    .references(() => deals.id),
  title: text("title").notNull(),
  owner: text("owner"),
  dueDate: text("due_date"),
  /** 'open' | 'done' | 'blocked' */
  status: text("status").notNull().default("open"),
  note: text("note"),
  /** link to proof this deliverable was delivered (nullable), e.g. a posted
   *  Instagram story or an event photo album - the sponsor-facing evidence */
  proofUrl: text("proof_url"),
  /** a headline metric captured on delivery (nullable free text), e.g.
   *  "1.2k reach" or "38 booth signups" */
  metricValue: text("metric_value"),
  /** ISO timestamp stamped when the deliverable first flipped to done (nullable) */
  deliveredAt: text("delivered_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  doneAt: text("done_at"),
});

// ---------------------------------------------------------------------------
// Company signals (fit-scoring checklist per company)
// ---------------------------------------------------------------------------

export const companySignals = sqliteTable("company_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  /** one of SIGNAL_CATALOG keys (see lib/data.ts) */
  signalKey: text("signal_key").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
});

// ---------------------------------------------------------------------------
// Discord inbox (captured Discord messages awaiting triage)
// ---------------------------------------------------------------------------

/** discord_inbox.status allowed values */
export type DiscordInboxStatus = "pending" | "attached" | "dismissed";

export const discordInbox = sqliteTable("discord_inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** upstream Discord message id; natural dedupe key */
  discordMessageId: text("discord_message_id").notNull().unique(),
  channelName: text("channel_name"),
  author: text("author"),
  content: text("content"),
  postedAt: text("posted_at"),
  /** 'pending' | 'attached' | 'dismissed' */
  status: text("status").notNull().default("pending"),
  /** company this message was attached to, once triaged (nullable) */
  attachedCompanyId: integer("attached_company_id").references(
    () => companies.id,
  ),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Contact inbox (scraped contacts awaiting keep/reject triage)
// ---------------------------------------------------------------------------

/** contact_inbox.status allowed values */
export type ContactInboxStatus = "pending" | "kept" | "rejected";
export type LinkedinTouchType = "dm" | "connection_request";

/**
 * contact_inbox.rejectReason allowed values - why a scraped contact was
 * rejected during triage. Captured so recurring patterns (e.g. a persona that
 * keeps yielding interns) can tighten the upstream scrape filters, and so
 * re-scraped rejects stay suppressed instead of resurfacing as new.
 */
export type ContactInboxRejectReason =
  | "intern"
  | "no_campus_presence"
  | "remote_only"
  | "wrong_location"
  | "duplicate"
  | "other";

export const contactInbox = sqliteTable("contact_inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** natural dedupe key: normalized LinkedIn URL, else "name|company" lowercased */
  dedupeKey: text("dedupe_key").notNull().unique(),
  name: text("name").notNull(),
  /** job title as scraped (nullable) */
  title: text("title"),
  /** company name as scraped; matched to a companies row at keep time */
  companyName: text("company_name"),
  linkedin: text("linkedin"),
  /** Apollo person id when the scrape captured it (nullable) */
  apolloId: text("apollo_id"),
  /** where the row came from, e.g. 'apollo' */
  source: text("source").notNull().default("apollo"),
  /** ISO timestamp of the scrape run that produced this row */
  scrapedAt: text("scraped_at"),
  /** 'pending' | 'kept' | 'rejected' */
  status: text("status").notNull().default("pending"),
  /** why it was rejected (nullable; see ContactInboxRejectReason) */
  rejectReason: text("reject_reason"),
  /** contact created from this row on keep (nullable) */
  contactId: integer("contact_id").references(() => contacts.id),
  /** company the kept contact was attached to (nullable) */
  companyId: integer("company_id").references(() => companies.id),
  /** ISO timestamp of the keep/reject decision (nullable while pending) */
  decidedAt: text("decided_at"),
  /** triage decision refinement: plain keep or keep + LinkedIn touch */
  decisionKind: text("decision_kind"),
  /** the exact touchpoint created by keep + LinkedIn, for safe correction */
  triageTouchpointId: integer("triage_touchpoint_id").references(
    () => touchpoints.id,
  ),
  /** deal changed by keep + LinkedIn, retained for undo/correction */
  triageDealId: integer("triage_deal_id").references(() => deals.id),
  /** whether triage assigned the LinkedIn cadence to this deal */
  triageAssignedCadence: integer("triage_assigned_cadence", {
    mode: "boolean",
  }),
  /** cadence cursor before triage advanced a pre-assigned LinkedIn cadence */
  triagePreviousCadenceStepIndex: integer(
    "triage_previous_cadence_step_index",
  ),
  /** deal stage before triage nudged it to outreach */
  triagePreviousStage: text("triage_previous_stage"),
  /** action scheduled by triage's LinkedIn cadence */
  triageNextActionId: integer("triage_next_action_id").references(
    () => nextActions.id,
  ),
  /** whether keep CREATED the contact (false = reused an existing one, null =
   *  decided before this was recorded). Gates what undo-keep may remove. */
  triageCreatedContact: integer("triage_created_contact", { mode: "boolean" }),
  /** LinkedIn DM vs connection request */
  linkedinTouchType: text("linkedin_touch_type"),
  /** optional context for the LinkedIn touch */
  linkedinNote: text("linkedin_note"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Users (login accounts - admin-provisioned, no public signup)
// ---------------------------------------------------------------------------

/** user.role allowed values */
export type UserRole = "admin" | "member";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  /** 'admin' | 'member' */
  role: text("role").notNull().default("member"),
  /** linked Discord snowflake, so bot-driven mutations attribute to this user instead of null */
  discordUserId: text("discord_user_id").unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Audit log (who changed what, for after-the-fact review)
// ---------------------------------------------------------------------------

/** audit_log.action allowed values */
export type AuditAction = "insert" | "update" | "delete";

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** who made the change; null means an importer/system script, not a login */
  userId: integer("user_id").references(() => users.id),
  /** table the change was made to, e.g. "companies" */
  tableName: text("table_name").notNull(),
  /** stringified primary key, so composite keys (e.g. deal_addons) still fit */
  rowId: text("row_id").notNull(),
  /** 'insert' | 'update' | 'delete' */
  action: text("action").notNull(),
  /** JSON-serialized row state before the change (null for inserts) */
  before: text("before"),
  /** JSON-serialized row state after the change (null for deletes) */
  after: text("after"),
  occurredAt: text("occurred_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Inferred row types (select / insert) for the data layer to reuse
// ---------------------------------------------------------------------------

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;

export type Touchpoint = typeof touchpoints.$inferSelect;
export type NewTouchpoint = typeof touchpoints.$inferInsert;

export type StageEvent = typeof stageEvents.$inferSelect;
export type NewStageEvent = typeof stageEvents.$inferInsert;

export type DeckVersion = typeof deckVersions.$inferSelect;
export type NewDeckVersion = typeof deckVersions.$inferInsert;

export type Tier = typeof tiers.$inferSelect;
export type NewTier = typeof tiers.$inferInsert;

export type Addon = typeof addons.$inferSelect;
export type NewAddon = typeof addons.$inferInsert;

export type DealAddon = typeof dealAddons.$inferSelect;

export type NextAction = typeof nextActions.$inferSelect;
export type NewNextAction = typeof nextActions.$inferInsert;

export type Cadence = typeof cadences.$inferSelect;
export type NewCadence = typeof cadences.$inferInsert;

export type CadenceStep = typeof cadenceSteps.$inferSelect;
export type NewCadenceStep = typeof cadenceSteps.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type Cycle = typeof cycles.$inferSelect;
export type NewCycle = typeof cycles.$inferInsert;

export type DeliverableTemplate = typeof deliverableTemplates.$inferSelect;
export type NewDeliverableTemplate = typeof deliverableTemplates.$inferInsert;

export type DealDeliverable = typeof dealDeliverables.$inferSelect;
export type NewDealDeliverable = typeof dealDeliverables.$inferInsert;

export type CompanySignal = typeof companySignals.$inferSelect;
export type NewCompanySignal = typeof companySignals.$inferInsert;

export type DiscordInboxMessage = typeof discordInbox.$inferSelect;
export type NewDiscordInboxMessage = typeof discordInbox.$inferInsert;

export type ContactInboxRow = typeof contactInbox.$inferSelect;
export type NewContactInboxRow = typeof contactInbox.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
