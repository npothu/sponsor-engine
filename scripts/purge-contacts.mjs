/**
 * Back up and purge every row in `contacts`.
 *
 * The July 2026 sourced contact set was largely inaccurate, so it is being
 * cleared wholesale to make room for a hand-curated set. Nothing is thrown
 * away: the script takes a full database snapshot, writes JSON + CSV exports of
 * every contact (with its company name attached), and records one `audit_log`
 * delete row per contact carrying the full pre-delete row state. It also
 * records one `audit_log` update row per surviving touchpoint/deal whose
 * contact_id/champion_contact_id gets cleared, so those rows' history shows
 * why the reference disappeared (contacts.referred_by_contact_id is not
 * audited separately - every contact row is deleted in this same run, and its
 * delete audit row already captures that field's pre-purge value).
 *
 * Dry run by default - prints what it would do and touches nothing:
 *   node scripts/purge-contacts.mjs
 * Commit:
 *   node scripts/purge-contacts.mjs --commit
 *
 * Idempotent: with zero contacts left it exports nothing and deletes nothing.
 *
 * Run from the repo root that owns `data/sponsortrack.db`, or pass
 * `--db <path>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const dbFlag = argv.indexOf("--db");
const DB_PATH = path.resolve(
  dbFlag !== -1 ? argv[dbFlag + 1] : path.join(process.cwd(), "data", "sponsortrack.db"),
);
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** RFC 4180 CSV cell. */
function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH} - nothing to do.`);
  process.exit(1);
}

const client = createClient({ url: `file:${DB_PATH}` });
const stamp = timestamp();

// ---------------------------------------------------------------------------
// 1. Survey what is about to be removed
// ---------------------------------------------------------------------------

const contactRows = (
  await client.execute(`
    SELECT c.*, co.name AS company_name, co.website AS company_website
    FROM contacts c
    LEFT JOIN companies co ON co.id = c.company_id
    ORDER BY c.id
  `)
).rows.map((r) => ({ ...r }));

const count = (sql) => client.execute(sql).then((r) => Number(r.rows[0].c));

const touchpointsToClear = (
  await client.execute("SELECT * FROM touchpoints WHERE contact_id IS NOT NULL")
).rows.map((r) => ({ ...r }));
const dealsToClear = (
  await client.execute("SELECT * FROM deals WHERE champion_contact_id IS NOT NULL")
).rows.map((r) => ({ ...r }));
const referralRefs = await count(
  "SELECT COUNT(*) c FROM contacts WHERE referred_by_contact_id IS NOT NULL",
);

console.log(`Database:            ${DB_PATH}`);
console.log(`Mode:                ${COMMIT ? "COMMIT" : "DRY RUN"}`);
console.log(`Contacts to delete:  ${contactRows.length}`);
console.log(`References to clear:`);
console.log(`  touchpoints.contact_id        ${touchpointsToClear.length}`);
console.log(`  deals.champion_contact_id     ${dealsToClear.length}`);
console.log(`  contacts.referred_by_contact_id ${referralRefs}`);

if (contactRows.length === 0) {
  console.log("\nNo contacts present - nothing to back up or delete.");
  process.exit(0);
}

const withEmail = contactRows.filter((r) => r.email).length;
const withLinkedin = contactRows.filter((r) => r.linkedin).length;
const companiesTouched = new Set(contactRows.map((r) => r.company_id)).size;
console.log(
  `\nOf those: ${withEmail} have an email, ${withLinkedin} have a LinkedIn URL, ` +
    `spread across ${companiesTouched} companies.`,
);

const snapshotPath = path.join(BACKUP_DIR, `pre-contact-purge-${stamp}.db`);
const jsonPath = path.join(BACKUP_DIR, `contacts-export-${stamp}.json`);
const csvPath = path.join(BACKUP_DIR, `contacts-export-${stamp}.csv`);

if (!COMMIT) {
  console.log("\nWould write:");
  console.log(`  ${snapshotPath}   (full DB snapshot)`);
  console.log(`  ${jsonPath}   (${contactRows.length} contacts, full rows)`);
  console.log(`  ${csvPath}   (same, spreadsheet-friendly)`);
  console.log(
    `  ${contactRows.length} audit_log rows (action='delete', table_name='contacts')`,
  );
  console.log(
    `  ${touchpointsToClear.length} audit_log rows (action='update', table_name='touchpoints')`,
  );
  console.log(
    `  ${dealsToClear.length} audit_log rows (action='update', table_name='deals')`,
  );
  console.log("\nThen delete every row from `contacts`. Re-run with --commit to do it.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Back up: full snapshot, then JSON + CSV exports
// ---------------------------------------------------------------------------

fs.mkdirSync(BACKUP_DIR, { recursive: true });

// VACUUM INTO is an online, WAL-safe snapshot - no file copying, no torn reads.
await client.execute(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);
console.log(`\nSnapshot written: ${snapshotPath}`);

fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      reason: "Bulk purge of inaccurate sourced contacts; kept for reference/re-import.",
      sourceDatabase: DB_PATH,
      count: contactRows.length,
      contacts: contactRows,
    },
    null,
    2,
  ) + "\n",
);
console.log(`JSON export written: ${jsonPath}`);

const columns = Object.keys(contactRows[0]);
const csv = [
  columns.join(","),
  ...contactRows.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
].join("\r\n");
fs.writeFileSync(csvPath, csv + "\r\n");
console.log(`CSV export written:  ${csvPath}`);

// ---------------------------------------------------------------------------
// 3. Clear inbound references, audit, delete
// ---------------------------------------------------------------------------

const occurredAt = new Date().toISOString();

await client.batch(
  [
    { sql: "UPDATE touchpoints SET contact_id = NULL WHERE contact_id IS NOT NULL" },
    {
      sql: "UPDATE deals SET champion_contact_id = NULL WHERE champion_contact_id IS NOT NULL",
    },
    {
      sql: "UPDATE contacts SET referred_by_contact_id = NULL WHERE referred_by_contact_id IS NOT NULL",
    },
    ...contactRows.map((row) => ({
      sql: `INSERT INTO audit_log (user_id, table_name, row_id, action, before, after, occurred_at)
            VALUES (NULL, 'contacts', ?, 'delete', ?, NULL, ?)`,
      args: [String(row.id), JSON.stringify(row), occurredAt],
    })),
    ...touchpointsToClear.map((row) => ({
      sql: `INSERT INTO audit_log (user_id, table_name, row_id, action, before, after, occurred_at)
            VALUES (NULL, 'touchpoints', ?, 'update', ?, ?, ?)`,
      args: [
        String(row.id),
        JSON.stringify(row),
        JSON.stringify({ ...row, contact_id: null }),
        occurredAt,
      ],
    })),
    ...dealsToClear.map((row) => ({
      sql: `INSERT INTO audit_log (user_id, table_name, row_id, action, before, after, occurred_at)
            VALUES (NULL, 'deals', ?, 'update', ?, ?, ?)`,
      args: [
        String(row.id),
        JSON.stringify(row),
        JSON.stringify({ ...row, champion_contact_id: null }),
        occurredAt,
      ],
    })),
    { sql: "DELETE FROM contacts" },
  ],
  "write",
);

const remaining = await count("SELECT COUNT(*) c FROM contacts");
console.log(
  `\nDeleted ${contactRows.length} contacts (audited). Contacts remaining: ${remaining}.`,
);
console.log("Companies, deals, touchpoints and history are untouched.");
