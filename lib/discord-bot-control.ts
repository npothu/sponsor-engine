/**
 * Shape of the app-side pause switch for the Discord bot.
 *
 * Like the heartbeat, this is deliberately free of database and server-only
 * imports so the web app, the standalone bot process, and the tests can all
 * share it.
 *
 * Why a database flag: the bot is a long-lived process on whichever machine
 * runs it - a deployed app cannot reach that process to stop it. The shared
 * database is the one channel both sides can see, so the app writes a pause
 * record here and the bot checks it before doing anything visible (commands,
 * passive capture, digests). The heartbeat keeps running while paused so the
 * app can still tell a paused bot from a stopped one.
 */

/** Settings key holding the pause switch, as a JSON BotPause. */
export const DISCORD_BOT_PAUSE_KEY = "discord_bot.paused";

export interface BotPause {
  /** Whether the bot should currently stand down. */
  paused: boolean;
  /** ISO timestamp of the last pause/resume flip. */
  at: string;
}

/**
 * Parse a stored pause payload, tolerating absent or garbled values.
 * Null means "never toggled", which callers treat the same as not paused.
 */
export function parseBotPause(raw: string | null): BotPause | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.paused !== "boolean") return null;
  return {
    paused: o.paused,
    at:
      typeof o.at === "string" && !Number.isNaN(Date.parse(o.at))
        ? o.at
        : new Date(0).toISOString(),
  };
}
