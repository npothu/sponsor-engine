import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the repo root (two levels above scripts/lib/). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Absolute path to the repo's local env file. */
export const ENV_PATH = join(REPO_ROOT, ".env.local");

/**
 * Minimal .env parser so standalone scripts need no runtime dotenv dependency.
 * Reads KEY=VALUE lines from .env.local at the repo root, ignores
 * comments/blank lines, strips surrounding quotes, and only sets keys that are
 * not already present in process.env. Missing file is a silent no-op (real
 * env vars, e.g. from Vercel or the shell, still win).
 *
 * Mirrors discord-bot/src/env.ts's loadEnv() so both bridges follow the same
 * convention for populating turso_url / turso_auth_token outside `next dev`.
 */
export function loadEnv() {
  let raw;
  try {
    raw = fs.readFileSync(ENV_PATH, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
