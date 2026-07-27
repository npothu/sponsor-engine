/**
 * Shape and staleness rules for the Discord bot's check-in.
 *
 * Deliberately free of database and server-only imports: the web app, the
 * standalone bot process, and the tests all share these definitions, and the
 * derivation below is pure so it can be tested without a database.
 *
 * Why a heartbeat at all: the bot's config lives in discord-bot/.env on
 * whichever machine runs the bot. That file is gitignored, so a deployed app -
 * or any second checkout - cannot read it, and a filesystem check there reports
 * a healthy, running bot as "Not configured". The shared database is the one
 * thing both sides can see, so the bot writes its state into it.
 */

/** Settings key holding the bot's last check-in, as a JSON BotHeartbeat. */
export const DISCORD_BOT_HEARTBEAT_KEY = "discord_bot.heartbeat";

/**
 * How long a check-in stays trustworthy. The bot re-writes every 5 minutes, so
 * this tolerates two missed beats before calling the process stopped.
 */
export const DISCORD_BOT_HEARTBEAT_STALE_MS = 15 * 60 * 1000;

export interface BotHeartbeat {
  /** ISO timestamp of this check-in. */
  at: string;
  /** Discord tag the bot is logged in as, e.g. "Sponsor Engine#4821". */
  botTag: string | null;
  /** How many sponsorship channels it is watching. */
  channelCount: number;
  guildId: string | null;
  digestChannelId: string | null;
  /** Machine the bot process runs on, so it is obvious which one to restart. */
  host: string | null;
}

export type BotState =
  /** Checked in recently - configured and running. */
  | "online"
  /** Checked in before, but not lately - configured, process is down. */
  | "offline"
  /** Never checked in against this database. */
  | "unconfigured";

/** Parse a stored heartbeat payload, tolerating older or garbled values. */
export function parseBotHeartbeat(raw: string | null): BotHeartbeat | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) return null;
  return {
    at: o.at,
    botTag: typeof o.botTag === "string" ? o.botTag : null,
    channelCount: typeof o.channelCount === "number" ? o.channelCount : 0,
    guildId: typeof o.guildId === "string" ? o.guildId : null,
    digestChannelId:
      typeof o.digestChannelId === "string" ? o.digestChannelId : null,
    host: typeof o.host === "string" ? o.host : null,
  };
}

/** Whether the bot is running, stopped, or has never been set up. */
export function deriveBotState(
  heartbeat: BotHeartbeat | null,
  now: number,
): { state: BotState; sinceLastSeenMs: number | null } {
  if (!heartbeat) return { state: "unconfigured", sinceLastSeenMs: null };
  const seen = Date.parse(heartbeat.at);
  if (Number.isNaN(seen)) {
    return { state: "unconfigured", sinceLastSeenMs: null };
  }
  // Clamped at 0 so a bot whose clock runs slightly ahead of the app's reads as
  // "just now" rather than a negative age.
  const sinceLastSeenMs = Math.max(0, now - seen);
  return {
    state:
      sinceLastSeenMs <= DISCORD_BOT_HEARTBEAT_STALE_MS ? "online" : "offline",
    sinceLastSeenMs,
  };
}
