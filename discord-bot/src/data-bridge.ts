import process from "node:process";
import { REPO_ROOT } from "./env.js";

/**
 * Bridge to the app's server-only data layer.
 *
 * Two things make this work from a separate Node process:
 *
 *  1. lib/db.ts resolves the SQLite path from process.cwd() at import time, so we
 *     chdir to the repo root BEFORE importing it. `npm -C discord-bot run bot`
 *     starts us in discord-bot/, which would otherwise point at a nonexistent
 *     discord-bot/data/ database.
 *
 *  2. lib/db.ts and lib/data.ts start with `import "server-only"`, whose default
 *     export throws. The bot runs tsx with `--conditions=react-server` (see the
 *     "bot" npm script), which resolves server-only to its empty no-op module -
 *     the same trick scripts/seed.ts relies on.
 *
 * better-sqlite3 opened in WAL mode tolerates this second connection alongside
 * the Next.js app's.
 */

process.chdir(REPO_ROOT);

/**
 * The app's data layer, loaded after the chdir above so its DB path resolves.
 * Exported as a named binding to avoid default-export interop flattening quirks
 * across tsx / different module resolvers.
 */
export const data = await import("../../lib/data.js");

export type DataLayer = typeof data;
