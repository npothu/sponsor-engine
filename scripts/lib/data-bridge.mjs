/**
 * Shared bridge from Node scripts to lib/data.ts (typed data layer).
 *
 * Usage (scripts must run under tsx with react-server condition):
 *
 *   npm run import-findings -- scripts/data/my-batch.json
 *   // or
 *   tsx --conditions=react-server scripts/import-findings.mjs scripts/data
 *
 * From another script:
 *
 *   import {
 *     createCompany,
 *     createContact,
 *     createImportRun,
 *     finishImportRun,
 *     findCompanyByHost,
 *     findCompanyByNormalizedName,
 *     findImportRunByLabel,
 *     getRejectedCompanyIds,
 *     getCompanyContacts,
 *     updateContact,
 *     listCompanies,
 *     db,
 *   } from "./lib/data-bridge.mjs";
 *
 * Two things make this work from a separate Node process:
 *
 *  1. lib/db.ts resolves the SQLite path from process.cwd() at import time, so we
 *     chdir to the repo root BEFORE importing the data layer. Run scripts from
 *     anywhere; the bridge always points at data/sponsortrack.db under the repo.
 *
 *  2. lib/db.ts and lib/data.ts import "server-only", whose default export throws.
 *     tsx with `--conditions=react-server` resolves server-only to its empty
 *     no-op module - the same trick scripts/seed.ts and discord-bot rely on.
 *
 * lib/db.ts is a drizzle-orm/libsql client, so every query here is async - all
 * exported functions in this module return Promises and must be awaited by
 * callers. With turso_url / turso_auth_token set (loaded from .env.local via
 * loadEnv() below, or already present in the environment), queries go to the
 * hosted Turso database; otherwise they fall back to the local SQLite file
 * under data/sponsortrack.db via libSQL's embedded "file:" mode.
 */

import process from "node:process";
import { eq, inArray, desc } from "drizzle-orm";
import { REPO_ROOT, loadEnv } from "./env.mjs";

// Populate turso_url / turso_auth_token from .env.local (repo root) when this
// script runs standalone, outside `next dev`'s own env loading. Real env vars
// (Vercel, shell exports) always win; this only fills gaps.
loadEnv();

process.chdir(REPO_ROOT);

const { db, ensureMigrated } = await import("../../lib/db.ts");
const { importRuns, deals, contacts, companies } = await import("../../lib/schema.ts");

// lib/db.ts's async client no longer runs the idempotent schema migration
// automatically on import (the old better-sqlite3 connection did it
// synchronously at module-load time) - await it explicitly once here so every
// script that imports this bridge gets a migrated schema before its first
// query, matching the old behavior.
await ensureMigrated();

export {
  createCompany,
  createContact,
  createImportRun,
  finishImportRun,
  findCompanyByHost,
  findCompanyByNormalizedName,
  updateContact,
  listCompanies,
  normalizeContactType,
  normalizeContactCategory,
  normalizeEmailStatus,
  normalizeCompanyPriority,
} from "../../lib/data.ts";

export { db };

export { normalizeHost, normalizeCompanyName } from "../../app/prospects/dedupe.ts";

/** Most recent import run with this label, if any. */
export async function findImportRunByLabel(label) {
  const rows = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.label, label))
    .orderBy(desc(importRuns.id));
  return rows[0] ?? null;
}

/** Company ids already written under any import run with this label. */
export async function getCompanyIdsImportedUnderLabel(label) {
  const runs = await db
    .select({ id: importRuns.id })
    .from(importRuns)
    .where(eq(importRuns.label, label));
  if (runs.length === 0) return new Set();
  const runIds = runs.map((r) => r.id);
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(inArray(companies.importRunId, runIds));
  return new Set(rows.map((r) => r.id));
}

/** Company ids that have at least one deal in stage "rejected". */
export async function getRejectedCompanyIds() {
  const rows = await db
    .selectDistinct({ companyId: deals.companyId })
    .from(deals)
    .where(eq(deals.stage, "rejected"));
  return new Set(rows.map((r) => r.companyId));
}

/** All contacts for a company (for importer dedupe). */
export async function getCompanyContacts(companyId) {
  return db.select().from(contacts).where(eq(contacts.companyId, companyId));
}

/** Single contact by id, or null. Used by the email-provenance importer. */
export async function getContactById(id) {
  const rows = await db.select().from(contacts).where(eq(contacts.id, id));
  return rows[0] ?? null;
}
