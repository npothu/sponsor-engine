/**
 * One-time data migration: copy every row from a local better-sqlite3 file
 * into the Turso database configured via turso_url / turso_auth_token.
 *
 * Usage:
 *   tsx --conditions=react-server scripts/migrate-local-to-turso.mjs <path-to-local-db>
 *
 * Requires turso_url and turso_auth_token in .env.local (or the real
 * environment) - refuses to run without them, since the whole point is
 * copying INTO the remote database, not the local dev fallback.
 */
import process from "node:process";
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import { loadEnv } from "./lib/env.mjs";
import { migrate } from "../lib/migrate.ts";

loadEnv();

const localPath = process.argv[2];
if (!localPath) {
  console.error("Usage: migrate-local-to-turso.mjs <path-to-local-db>");
  process.exit(1);
}

if (!process.env.turso_url) {
  console.error("turso_url is not set (check .env.local) - refusing to run.");
  process.exit(1);
}

// Tables in FK-safe insertion order.
const TABLES = [
  "import_runs",
  "companies",
  "tiers",
  "addons",
  "deck_versions",
  "cadences",
  "templates",
  "cadence_steps",
  "contacts",
  "deals",
  "stage_events",
  "touchpoints",
  "deal_addons",
  "next_actions",
  "settings",
  "cycles",
  "deliverable_templates",
  "deal_deliverables",
  "company_signals",
  "discord_inbox",
];

async function main() {
  const local = new Database(localPath, { readonly: true });
  const localVersion = local.pragma("user_version", { simple: true });
  console.log(`Local db: ${localPath} (user_version=${localVersion})`);

  const client = createClient({
    url: process.env.turso_url,
    authToken: process.env.turso_auth_token,
  });

  console.log("Ensuring Turso schema is migrated...");
  await migrate(client);

  const existing = await client.execute("SELECT COUNT(*) AS n FROM companies");
  const existingCount = existing.rows[0]?.n ?? 0;
  if (existingCount > 0) {
    console.error(
      `Refusing to run: the Turso database already has ${existingCount} companies. ` +
        `This script does not de-duplicate - re-running it would create duplicate rows. ` +
        `If you intend to replace the remote data, destroy and recreate the Turso db first.`,
    );
    process.exit(1);
  }

  for (const table of TABLES) {
    const tableExists = local
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table);
    if (!tableExists) {
      console.log(`  skip ${table} (not present in local db)`);
      continue;
    }

    const rows = local.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const insertSql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

    const statements = rows.map((row) => ({
      sql: insertSql,
      args: columns.map((c) => row[c]),
    }));

    await client.batch(statements, "write");
    console.log(`  ${table}: ${rows.length} rows copied`);

    const maxIdRow = rows.reduce(
      (max, r) => (typeof r.id === "number" && r.id > max ? r.id : max),
      0,
    );
    if (maxIdRow > 0) {
      const updateResult = await client.execute({
        sql: "UPDATE sqlite_sequence SET seq = ? WHERE name = ? AND seq < ?",
        args: [maxIdRow, table, maxIdRow],
      });
      if (updateResult.rowsAffected === 0) {
        const existing = await client.execute({
          sql: "SELECT 1 FROM sqlite_sequence WHERE name = ?",
          args: [table],
        });
        if (existing.rows.length === 0) {
          await client.execute({
            sql: "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)",
            args: [table, maxIdRow],
          });
        }
      }
    }
  }

  const remoteVersionResult = await client.execute(
    "SELECT version FROM schema_version WHERE id = 1",
  );
  const remoteVersion = remoteVersionResult.rows[0]?.version;
  console.log(`\nDone. Turso schema_version=${remoteVersion}`);

  local.close();
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
