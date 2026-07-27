import type { Client } from "@libsql/client";
import {
  normalizeCompanyName,
  normalizeHost,
} from "../app/prospects/dedupe";
import { backfillV9ContactData } from "./contact-backfill";

/**
 * The highest schema version this build knows how to produce. Every step in
 * migrate() up to and including this number is applied in order.
 */
export const LATEST_SCHEMA_VERSION = 16;

/**
 * Reads the applied schema version from a dedicated schema_version table
 * rather than PRAGMA user_version. Turso's remote (Hrana/HTTP) protocol
 * rejects `PRAGMA user_version = N` as a disallowed statement - only local
 * embedded SQLite accepts that write - so version tracking has to live in a
 * normal table to work identically against a local file and hosted Turso.
 */
async function getSchemaVersion(client: Client): Promise<number> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );
  `);
  const result = await client.execute(
    "SELECT version FROM schema_version WHERE id = 1",
  );
  return (result.rows[0] as unknown as { version: number } | undefined)?.version ?? 0;
}

async function setSchemaVersion(client: Client, version: number): Promise<void> {
  await client.execute({
    sql: `INSERT INTO schema_version (id, version) VALUES (1, ?)
          ON CONFLICT(id) DO UPDATE SET version = excluded.version`,
    args: [version],
  });
}

/**
 * Add a column only if it is not already present on the table. Wraps the
 * ALTER TABLE so re-running a migration on a database that already has the
 * column is a safe no-op (SQLite has no ADD COLUMN IF NOT EXISTS).
 */
async function addColumnIfMissing(
  client: Client,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const cols = await client.execute(`PRAGMA table_info(${table})`);
  if (cols.rows.some((c) => (c as unknown as { name: string }).name === column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Idempotent, versioned schema creation. Safe to call on every import.
 *
 * We track the applied schema version in a dedicated schema_version table
 * (not PRAGMA user_version - Turso's remote protocol rejects writing that
 * pragma, so version tracking has to be a normal table to work identically
 * against a local file and hosted Turso). Each
 * numbered step is applied only when the stored version is below it, and every
 * step is itself written to be re-runnable (CREATE TABLE IF NOT EXISTS, guarded
 * ALTER TABLE ADD COLUMN) so an interrupted or partially-applied upgrade heals
 * on the next run. Steps are strictly additive and never drop or rewrite data.
 *
 *   version 1 = the original baseline table set (unchanged).
 *   version 2 = settings, cycles, deliverable_templates, deal_deliverables,
 *               company_signals, discord_inbox, and companies.fit_notes.
 *   version 3 = companies.priority (outreach ranking: high | medium | low).
 *   version 4 = deck_versions.url (shareable link) and cycles.anchor_event_date
 *               (nullable ISO date for the anchor-event countdown).
 *   version 5 = companies.expected_tier_id (nullable target tier used to weight
 *               the prospect pool by dollar potential before a deal exists).
 *   version 6 = companies.re_ask_on / re_ask_reason (dated re-approach signal
 *               that suppresses a company from the cold pool until its date).
 *   version 7 = contacts.contact_type (decision-maker role) and
 *               contacts.referred_by_contact_id (referral-chain self-FK), plus
 *               deals.lost_reason and deals.champion_contact_id (structured
 *               prior-outcome context carried across cycles).
 *   version 8 = stage_events (per-deal stage-transition history, the foundation
 *               for conversion analytics). Later analytics/fulfillment features
 *               extend this same step with additive columns.
 *   version 9 = sourcing pipeline foundation: import_runs audit table,
 *               companies.normalized_name / host / import_run_id (dedupe keys),
 *               contacts.category / email_status / email_source / import_run_id,
 *               and supporting indexes for importer dedupe and FK lookups.
 *   version 10 = query performance indexes (touchpoints.deal_id,
 *                cadence_steps.cadence_id, companies.priority).
 *   version 11 = users (login accounts - admin-provisioned, no public signup).
 *   version 12 = audit_log (who changed what, for after-the-fact review).
 *   version 13 = next_actions.owner (free-text owner name; the Discord bot maps
 *                owner names to Discord user IDs for digest @-mentions).
 *   version 14 = contact_inbox (scraped contacts awaiting keep/reject triage,
 *                deduped on a natural key so re-scrapes never resurface
 *                already-decided people).
 *   version 15 = correction metadata for triage-created LinkedIn touches.
 *   version 16 = users.discord_user_id (nullable, unique linked Discord
 *                snowflake). Lets the Discord bot resolve the invoking user
 *                back to an app account so /log and /prospect attribute audit
 *                rows to a real person instead of null.
 */
export async function migrate(client: Client): Promise<void> {
  const startVersion = await getSchemaVersion(client);

  if (startVersion < 1) {
    await migrateToV1(client);
  }
  if (startVersion < 2) {
    await migrateToV2(client);
  }
  if (startVersion < 3) {
    await migrateToV3(client);
  }
  if (startVersion < 4) {
    await migrateToV4(client);
  }
  if (startVersion < 5) {
    await migrateToV5(client);
  }
  if (startVersion < 6) {
    await migrateToV6(client);
  }
  if (startVersion < 7) {
    await migrateToV7(client);
  }
  if (startVersion < 8) {
    await migrateToV8(client);
  }
  if (startVersion < 9) {
    await migrateToV9(client);
  }
  if (startVersion < 10) {
    await migrateToV10(client);
  }
  if (startVersion < 11) {
    await migrateToV11(client);
  }
  if (startVersion < 12) {
    await migrateToV12(client);
  }
  if (startVersion < 13) {
    await migrateToV13(client);
  }
  if (startVersion < 14) {
    await migrateToV14(client);
  }
  if (startVersion < 15) {
    await migrateToV15(client);
  }
  if (startVersion < 16) {
    await migrateToV16(client);
  }

  if (startVersion < LATEST_SCHEMA_VERSION) {
    await setSchemaVersion(client, LATEST_SCHEMA_VERSION);
  }

  // Idempotent data backfill for v9 contact columns (runs even when already at v9).
  const finalVersion = Math.max(startVersion, LATEST_SCHEMA_VERSION);
  if (finalVersion >= 9) {
    await backfillV9ContactData(client);
  }
}

/**
 * Version 1 - the original baseline. Uses CREATE TABLE IF NOT EXISTS so it is a
 * no-op on any database that already has these tables (i.e. every pre-versioning
 * database), which is exactly what lets us adopt user_version without a rebuild.
 */
async function migrateToV1(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'corporate',
      website TEXT,
      source TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      phone TEXT,
      linkedin TEXT,
      sourced_from TEXT,
      warmth TEXT NOT NULL DEFAULT 'cold',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      package_label TEXT
    );

    CREATE TABLE IF NOT EXISTS addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_note TEXT
    );

    CREATE TABLE IF NOT EXISTS deck_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      description TEXT,
      released_at TEXT,
      is_current INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cadences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scenario TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS cadence_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cadence_id INTEGER NOT NULL REFERENCES cadences(id),
      position INTEGER NOT NULL DEFAULT 0,
      wait_days INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'email',
      template_id INTEGER REFERENCES templates(id),
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      cycle TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'prospect',
      target_tier_id INTEGER REFERENCES tiers(id),
      ask_amount INTEGER,
      custom_terms TEXT,
      cadence_id INTEGER REFERENCES cadences(id),
      cadence_step_index INTEGER NOT NULL DEFAULT 0,
      stage_entered_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS touchpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      deal_id INTEGER REFERENCES deals(id),
      contact_id INTEGER REFERENCES contacts(id),
      channel TEXT NOT NULL DEFAULT 'email',
      direction TEXT NOT NULL DEFAULT 'outbound',
      occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      summary TEXT,
      outcome TEXT,
      deck_version_id INTEGER REFERENCES deck_versions(id),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE TABLE IF NOT EXISTS deal_addons (
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      addon_id INTEGER NOT NULL REFERENCES addons(id),
      PRIMARY KEY (deal_id, addon_id)
    );

    CREATE TABLE IF NOT EXISTS next_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_by TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      done_at TEXT
    );
  `);
}

/**
 * Version 2 - additive tables and columns for the seven feature areas built on
 * top of the MVP. New tables use CREATE TABLE IF NOT EXISTS; the new companies
 * column uses the guarded ALTER helper. Nothing here is destructive.
 */
async function migrateToV2(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      anchor_event TEXT,
      starts_on TEXT,
      ends_on TEXT,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deliverable_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier_id INTEGER NOT NULL REFERENCES tiers(id),
      title TEXT NOT NULL,
      default_owner TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deal_deliverables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      title TEXT NOT NULL,
      owner TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      done_at TEXT
    );

    CREATE TABLE IF NOT EXISTS company_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      signal_key TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_company_signals_company_key
      ON company_signals (company_id, signal_key);

    CREATE TABLE IF NOT EXISTS discord_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_message_id TEXT NOT NULL UNIQUE,
      channel_name TEXT,
      author TEXT,
      content TEXT,
      posted_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attached_company_id INTEGER REFERENCES companies(id),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  await addColumnIfMissing(client, "companies", "fit_notes", "TEXT");
}

/**
 * Version 3 - adds companies.priority, a plain-text outreach ranking
 * ('high' | 'medium' | 'low', enforced by the data layer). Uses the guarded
 * ALTER helper so re-running on a database that already has the column is a
 * no-op; existing rows inherit the 'medium' default. Non-destructive.
 */
async function migrateToV3(client: Client): Promise<void> {
  await addColumnIfMissing(
    client,
    "companies",
    "priority",
    "TEXT NOT NULL DEFAULT 'medium'",
  );
}

/**
 * Version 4 - two additive, nullable columns:
 *   deck_versions.url        - a shareable link to the deck/packet, exposed as
 *                              the {{deck_link}} merge field.
 *   cycles.anchor_event_date - the ISO date of the cycle's anchor event, the
 *                              backbone for the countdown/runway features.
 * Both use the guarded ALTER helper so re-running on a database that already
 * has the column is a no-op; existing rows inherit NULL. Non-destructive.
 */
async function migrateToV4(client: Client): Promise<void> {
  await addColumnIfMissing(client, "deck_versions", "url", "TEXT");
  await addColumnIfMissing(client, "cycles", "anchor_event_date", "TEXT");
}

/**
 * Version 5 - companies.expected_tier_id, a nullable target-tier reference used
 * to weight the prospect pool by dollar potential before a deal exists. Guarded
 * ALTER so re-running is a no-op; existing rows inherit NULL. Non-destructive.
 */
async function migrateToV5(client: Client): Promise<void> {
  await addColumnIfMissing(client, "companies", "expected_tier_id", "INTEGER");
}

/**
 * Version 6 - companies.re_ask_on / re_ask_reason, the dated re-approach signal.
 * A company with a future re_ask_on is suppressed from the cold prospect pool
 * and resurfaces on/after that date. Guarded ALTERs, both nullable; re-running
 * is a no-op and existing rows inherit NULL. Non-destructive.
 */
async function migrateToV6(client: Client): Promise<void> {
  await addColumnIfMissing(client, "companies", "re_ask_on", "TEXT");
  await addColumnIfMissing(client, "companies", "re_ask_reason", "TEXT");
}

/**
 * Version 7 - relationship-mapping and prior-outcome columns:
 *   contacts.contact_type            - decision-maker role classification
 *                                      ('unknown' | 'gatekeeper' | 'influencer' |
 *                                      'champion' | 'budget_holder'), enforced by
 *                                      the data layer's normalizeContactType.
 *   contacts.referred_by_contact_id  - nullable self-FK capturing who introduced
 *                                      this contact (referral-chain edge).
 *   deals.lost_reason                - nullable structured loss enum (budget |
 *                                      timing | no_response | no_fit |
 *                                      chose_competitor | wrong_contact | other).
 *   deals.champion_contact_id        - nullable FK to the contact who championed
 *                                      the deal, carried into next-cycle deals.
 * All guarded ALTERs; contact_type carries a NOT NULL default so existing rows
 * inherit 'unknown', the rest inherit NULL. Re-running is a no-op. Non-destructive.
 */
async function migrateToV7(client: Client): Promise<void> {
  await addColumnIfMissing(
    client,
    "contacts",
    "contact_type",
    "TEXT NOT NULL DEFAULT 'unknown'",
  );
  await addColumnIfMissing(client, "contacts", "referred_by_contact_id", "INTEGER");
  await addColumnIfMissing(client, "deals", "lost_reason", "TEXT");
  await addColumnIfMissing(client, "deals", "champion_contact_id", "INTEGER");
}

/**
 * Version 8 - analytics and fulfillment foundation. The first additive step
 * here is stage_events, one row per stage change on a deal (written on every
 * path that mutates deals.stage), which powers real conversion analytics. Later
 * features extend this same step with additive, guarded columns. Uses CREATE
 * TABLE IF NOT EXISTS so re-running is a no-op. Non-destructive.
 */
async function migrateToV8(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS stage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES deals(id),
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      entered_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE INDEX IF NOT EXISTS idx_stage_events_deal
      ON stage_events (deal_id);
  `);

  // touchpoints.template_id - template response-rate attribution (nullable FK).
  await addColumnIfMissing(client, "touchpoints", "template_id", "INTEGER");

  // deal_deliverables proof-of-value capture (all nullable TEXT): a proof link,
  // a headline metric, and the delivery timestamp stamped on first done.
  await addColumnIfMissing(client, "deal_deliverables", "proof_url", "TEXT");
  await addColumnIfMissing(client, "deal_deliverables", "metric_value", "TEXT");
  await addColumnIfMissing(client, "deal_deliverables", "delivered_at", "TEXT");

  // deals.satisfaction - coarse sponsor-satisfaction signal (nullable TEXT;
  // happy | neutral | at_risk) that orders the rollover renewal preview.
  await addColumnIfMissing(client, "deals", "satisfaction", "TEXT");

  // companies.fiscal_year_end - nullable ISO date of the company's fiscal-year
  // end, powering the "budget windows closing soon" nudge.
  await addColumnIfMissing(client, "companies", "fiscal_year_end", "TEXT");
}

/**
 * Version 9 - sourcing pipeline foundation. Adds import_runs (audit trail for
 * JSON importer commits), dedupe keys on companies (normalized_name, host),
 * contact provenance columns (category, email_status, email_source), nullable
 * import_run_id FKs on companies/contacts, and indexes for dedupe + FK lookups.
 * Backfills normalized_name and host for all existing companies using the same
 * helpers as app/prospects/dedupe.ts. When multiple companies share a website
 * host, the lowest-id row keeps host; duplicates get host=NULL. All additive;
 * re-running is a no-op.
 */
async function migrateToV9(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      findings_file TEXT,
      records_written INTEGER NOT NULL DEFAULT 0
    );
  `);

  await addColumnIfMissing(client, "companies", "normalized_name", "TEXT");
  await addColumnIfMissing(client, "companies", "host", "TEXT");
  await addColumnIfMissing(client, "companies", "import_run_id", "INTEGER");
  await addColumnIfMissing(client, "contacts", "category", "TEXT");
  await addColumnIfMissing(client, "contacts", "email_status", "TEXT");
  await addColumnIfMissing(client, "contacts", "email_source", "TEXT");
  await addColumnIfMissing(client, "contacts", "import_run_id", "INTEGER");

  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_contacts_company_id
      ON contacts(company_id);

    CREATE INDEX IF NOT EXISTS idx_touchpoints_company_id
      ON touchpoints(company_id);

    CREATE INDEX IF NOT EXISTS idx_deals_company_id
      ON deals(company_id);

    CREATE INDEX IF NOT EXISTS idx_next_actions_deal_id
      ON next_actions(deal_id);
  `);

  await client.execute(`DROP INDEX IF EXISTS idx_companies_host`);

  const rowsResult = await client.execute(
    "SELECT id, name, website FROM companies ORDER BY id ASC",
  );
  const rows = rowsResult.rows as unknown as Array<{
    id: number;
    name: string;
    website: string | null;
  }>;

  const seenHosts = new Set<string>();
  for (const row of rows) {
    const normalizedName = normalizeCompanyName(row.name);
    const host = normalizeHost(row.website);
    let uniqueHost: string | null = null;
    if (host && !seenHosts.has(host)) {
      seenHosts.add(host);
      uniqueHost = host;
    }
    await client.execute({
      sql: "UPDATE companies SET normalized_name = ?, host = ? WHERE id = ?",
      args: [normalizedName, uniqueHost, row.id],
    });
  }

  await client.executeMultiple(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_host
      ON companies(host) WHERE host IS NOT NULL;
  `);
}

/**
 * Version 10 - query performance indexes. Adds indexes that the bulk outreach
 * status queries need to avoid full table scans:
 *   touchpoints.deal_id  - max(occurred_at) groupBy in prospectOutreachStatusBulk
 *   cadence_steps.cadence_id - count(*) groupBy for step totals
 *   companies.priority   - ORDER BY / filter in listCompanies
 * All additive; re-running is a no-op via CREATE INDEX IF NOT EXISTS.
 */
async function migrateToV10(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_touchpoints_deal_id
      ON touchpoints(deal_id);

    CREATE INDEX IF NOT EXISTS idx_cadence_steps_cadence_id
      ON cadence_steps(cadence_id);

    CREATE INDEX IF NOT EXISTS idx_companies_priority
      ON companies(priority);
  `);
}

/**
 * Version 11 - users (login accounts). Admin-provisioned only, via
 * scripts/create-user.ts - there is no public signup route. Uses CREATE TABLE
 * IF NOT EXISTS so re-running is a no-op.
 */
async function migrateToV11(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

/**
 * Version 12 - audit_log (who changed what, for after-the-fact review). Every
 * mutator in lib/data.ts writes one row per insert/update/delete via the
 * withAudit() wrapper. user_id is nullable - null means an importer/system
 * script rather than a logged-in user. Uses CREATE TABLE IF NOT EXISTS so
 * re-running is a no-op.
 */
async function migrateToV12(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before TEXT,
      after TEXT,
      occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at
      ON audit_log(occurred_at);
  `);
}

/**
 * Version 13 - next_actions.owner, a nullable free-text owner name. Powers
 * per-person accountability: the Discord bot maps owner names to Discord user
 * IDs (OWNER_DISCORD_MENTIONS) to @-mention owners in the daily digest. Guarded
 * ALTER so re-running is a no-op; existing rows inherit NULL. Non-destructive.
 */
async function migrateToV13(client: Client): Promise<void> {
  await addColumnIfMissing(client, "next_actions", "owner", "TEXT");
}

/**
 * Version 14 - contact_inbox, the staging table for scraped contacts (Apollo
 * screen scrapes pasted into /triage). Rows are deduped on dedupe_key (the
 * normalized LinkedIn URL, else "name|company" lowercased) so re-pasting an
 * overlapping scrape is a no-op, and decided rows (kept/rejected) never
 * resurface as pending. Uses CREATE TABLE IF NOT EXISTS so re-running is a
 * no-op. Non-destructive.
 */
async function migrateToV14(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS contact_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      title TEXT,
      company_name TEXT,
      linkedin TEXT,
      apollo_id TEXT,
      source TEXT NOT NULL DEFAULT 'apollo',
      scraped_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reject_reason TEXT,
      contact_id INTEGER REFERENCES contacts(id),
      company_id INTEGER REFERENCES companies(id),
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE INDEX IF NOT EXISTS idx_contact_inbox_status
      ON contact_inbox(status);
  `);
}

/**
 * Version 15 - link a kept inbox row to the LinkedIn touch, deal, cadence
 * action, and prior stage created by Keep + DM'd. This lets the history UI edit
 * or safely undo that outreach without guessing from summary text.
 */
async function migrateToV15(client: Client): Promise<void> {
  await addColumnIfMissing(client, "contact_inbox", "decision_kind", "TEXT");
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "triage_touchpoint_id",
    "INTEGER REFERENCES touchpoints(id)",
  );
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "triage_deal_id",
    "INTEGER REFERENCES deals(id)",
  );
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "triage_assigned_cadence",
    "INTEGER",
  );
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "triage_previous_cadence_step_index",
    "INTEGER",
  );
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "triage_previous_stage",
    "TEXT",
  );
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "triage_next_action_id",
    "INTEGER REFERENCES next_actions(id)",
  );
  await addColumnIfMissing(
    client,
    "contact_inbox",
    "linkedin_touch_type",
    "TEXT",
  );
  await addColumnIfMissing(client, "contact_inbox", "linkedin_note", "TEXT");
}

/**
 * Version 16 - users.discord_user_id, a nullable, unique linked Discord
 * snowflake set via `npm run link-discord-user`. Guarded ALTER so re-running
 * is a no-op; existing rows inherit NULL. Non-destructive.
 */
async function migrateToV16(client: Client): Promise<void> {
  await addColumnIfMissing(client, "users", "discord_user_id", "TEXT");
  await client.executeMultiple(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_user_id
      ON users(discord_user_id) WHERE discord_user_id IS NOT NULL;
  `);
}
