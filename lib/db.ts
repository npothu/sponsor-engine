import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { migrate } from "./migrate";

/**
 * Singleton libSQL client wrapped in drizzle.
 *
 * With turso_url / turso_auth_token set (production, and any local dev machine
 * that wants to point at the shared database), this connects to the hosted
 * Turso database. Without them, it falls back to a local SQLite file via
 * libSQL's "file:" URL scheme - same async client, same query API either way,
 * no better-sqlite3 dependency needed.
 *
 * The local file lives at data/sponsortrack.db, a name retained from the app's
 * former name (SponsorTrack) so existing local data keeps loading after the
 * rename to Sponsor Engine.
 *
 * We do NOT use drizzle-kit migrations at runtime - lib/migrate.ts is the
 * source of truth for the schema and mirrors lib/schema.ts.
 */

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sponsortrack.db");

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

interface GlobalWithDb {
  __sponsortrackDb?: DrizzleDb;
  __sponsortrackClient?: Client;
  __sponsortrackMigrated?: Promise<void>;
}

const globalForDb = globalThis as unknown as GlobalWithDb;

function createConnection(): { db: DrizzleDb; client: Client } {
  const url = process.env.turso_url;
  const authToken = process.env.turso_auth_token;

  const client = url
    ? createClient({ url, authToken })
    : createLocalClient();

  const db = drizzle(client, { schema });
  return { db, client };
}

function createLocalClient(): Client {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  return createClient({ url: `file:${DB_PATH}` });
}

const connection = globalForDb.__sponsortrackDb
  ? { db: globalForDb.__sponsortrackDb, client: globalForDb.__sponsortrackClient! }
  : createConnection();

if (!globalForDb.__sponsortrackDb) {
  globalForDb.__sponsortrackDb = connection.db;
  globalForDb.__sponsortrackClient = connection.client;
}

/** The drizzle database instance. Import this everywhere. */
export const db = connection.db;

/** Raw libSQL client, exposed for scripts and low-level needs. */
export const client = connection.client;

export { schema };

/**
 * Runs the idempotent schema migration exactly once per process, memoized so
 * concurrent callers (e.g. overlapping serverless cold starts) await the same
 * promise instead of racing duplicate ALTER TABLE statements against the same
 * remote database. Every lib/data.ts entry point calls this before querying.
 */
export function ensureMigrated(): Promise<void> {
  if (!globalForDb.__sponsortrackMigrated) {
    globalForDb.__sponsortrackMigrated = migrate(client);
  }
  return globalForDb.__sponsortrackMigrated;
}
