import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repo root (one level above discord-bot/). */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Absolute path to this bot package's directory. */
export const BOT_DIR = path.resolve(__dirname, "..");

/** Absolute path to the bot's .env file. */
export const ENV_PATH = path.join(BOT_DIR, ".env");

/**
 * Minimal .env parser so the bot needs no runtime dotenv dependency. Reads
 * KEY=VALUE lines, ignores comments/blank lines, strips surrounding quotes, and
 * only sets keys that are not already present in process.env. Missing file is a
 * silent no-op (real env vars still work).
 */
export function loadEnv(): void {
  let raw: string;
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

export interface BotConfig {
  token: string | null;
  channelIds: string[];
  guildId: string | null;
  /** channel to post the daily 8am overdue/due-today digest to (optional) */
  digestChannelId: string | null;
  /** local hour (0-23) to post the daily digest; defaults to 8 (8am) */
  digestHour: number;
  /**
   * lowercased next-action owner name -> Discord user ID, parsed from
   * OWNER_DISCORD_MENTIONS ("alex=123456789,priya=987654321"). Owners in
   * this map get @-mentioned on their items in the daily digest.
   */
  ownerMentions: Record<string, string>;
}

/** Parse "name=discordId,name=discordId" into a lowercased-name lookup map. */
export function parseOwnerMentions(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim().toLowerCase();
    const id = pair.slice(eq + 1).trim();
    if (name && /^\d+$/.test(id)) map[name] = id;
  }
  return map;
}

/** Read and normalize the bot configuration from the environment. */
export function readConfig(): BotConfig {
  const token = (process.env.DISCORD_BOT_TOKEN ?? "").trim() || null;
  const channelIds = (process.env.SPONSORSHIP_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const guildId = (process.env.DISCORD_GUILD_ID ?? "").trim() || null;
  const digestChannelId =
    (process.env.DIGEST_CHANNEL_ID ?? "").trim() || null;
  const parsedHour = Number.parseInt(
    (process.env.DIGEST_HOUR ?? "").trim(),
    10,
  );
  const digestHour =
    Number.isFinite(parsedHour) && parsedHour >= 0 && parsedHour <= 23
      ? parsedHour
      : 8;
  const ownerMentions = parseOwnerMentions(
    process.env.OWNER_DISCORD_MENTIONS ?? "",
  );
  return {
    token,
    channelIds,
    guildId,
    digestChannelId,
    digestHour,
    ownerMentions,
  };
}
