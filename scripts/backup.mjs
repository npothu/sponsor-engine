/**
 * Online SQLite backup with 7-copy rotation.
 *
 * Run: npm run backup
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sponsortrack.db");
const BACKUP_DIR = path.join(DB_DIR, "backups");
const KEEP = 7;

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH} — nothing to back up.`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const dest = path.join(BACKUP_DIR, `sponsortrack-${timestamp()}.db`);
const source = new Database(DB_PATH, { readonly: true });

try {
  await source.backup(dest);
  console.log(`Backed up to ${dest}`);
} finally {
  source.close();
}

const backups = fs
  .readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith("sponsortrack-") && f.endsWith(".db"))
  .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

for (const old of backups.slice(KEEP)) {
  fs.unlinkSync(path.join(BACKUP_DIR, old.name));
  console.log(`Removed old backup ${old.name}`);
}
