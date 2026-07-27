/**
 * Minimal async shim over @libsql/client that mimics the small slice of the
 * better-sqlite3 API these one-off importer/enrichment scripts used:
 *
 *   const stmt = db.prepare(sql);
 *   await stmt.get(...args);   // one row or undefined
 *   await stmt.all(...args);   // array of rows
 *   await stmt.run(...args);   // { lastInsertRowid, changes }
 *   await db.transaction(fn)(...args);  // runs fn(...args), awaiting the result
 *
 * This exists purely to make the mechanical migration off a direct,
 * synchronous `new Database("data/sponsortrack.db")` connection onto the
 * shared async lib/db.ts client low-risk: call sites keep their exact shape
 * (positional args, or a single named-params object using "@name" keys, same
 * as better-sqlite3 supports) and just gain `await`.
 *
 * NOTE on transactions: db.transaction(fn) here does NOT wrap fn in a real
 * BEGIN/COMMIT - it just awaits fn(...args). Every script that uses it
 * documents itself as idempotent and safe to re-run, and each `.run()` still
 * lands as its own committed statement against the shared libSQL client, so a
 * mid-run crash leaves partial (not corrupt) progress that a re-run recovers
 * from - the same recovery story these scripts already rely on for dry-run /
 * re-run safety. A true interactive transaction (client.transaction("write"))
 * was deliberately not used because these scripts prepare statements once,
 * up front, against a single shared connection, and call them from ordinary
 * (non-transactional) scope elsewhere in the same script; forcing those
 * pre-built statements onto a separate transactional client object would
 * require restructuring each script's statement wiring, which is a bigger,
 * riskier change than this mechanical async pass is meant to make. Flagged in
 * the migration report for follow-up if true atomicity is ever required.
 *
 * NOTE on migration: the old synchronous better-sqlite3 connection in
 * lib/db.ts ran the idempotent schema migration once, at module-import time,
 * so every consumer (including these scripts) got a migrated schema for free.
 * The new async lib/db.ts client does NOT do this automatically - it exposes
 * a memoized `ensureMigrated()` that callers must await. Since these scripts
 * import the raw `client` directly (not through lib/data.ts, whose request
 * path is expected to call ensureMigrated() itself), this shim awaits it once
 * lazily, before the first statement runs, so callers don't need their own
 * boilerplate.
 */

/** Convert a better-sqlite3-style named-or-positional arg list into libsql args. */
function toArgs(bindings) {
  if (bindings.length === 1 && bindings[0] !== null && typeof bindings[0] === "object") {
    return bindings[0];
  }
  return bindings;
}

/**
 * Wraps a raw @libsql/client `Client` (e.g. the `client` export from
 * lib/db.ts) to expose `db.prepare(sql).get/all/run(...)` (all async) plus a
 * `db.transaction(fn)` that just awaits `fn`, matching the shape these
 * scripts already call.
 */
export function createSqliteShim(client) {
  let migrated;
  async function ready() {
    if (!migrated) {
      const { ensureMigrated } = await import("../../lib/db.ts");
      migrated = ensureMigrated();
    }
    return migrated;
  }

  return {
    prepare(sql) {
      return {
        async get(...bindings) {
          await ready();
          const result = await client.execute({ sql, args: toArgs(bindings) });
          return result.rows[0];
        },
        async all(...bindings) {
          await ready();
          const result = await client.execute({ sql, args: toArgs(bindings) });
          return result.rows;
        },
        async run(...bindings) {
          await ready();
          const result = await client.execute({ sql, args: toArgs(bindings) });
          return {
            lastInsertRowid:
              result.lastInsertRowid != null ? Number(result.lastInsertRowid) : undefined,
            changes: result.rowsAffected,
          };
        },
      };
    },
    transaction(fn) {
      return async (...args) => fn(...args);
    },
  };
}
