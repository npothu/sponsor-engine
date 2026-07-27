import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getBotHeartbeat, getBotPause } from "@/lib/data";
import {
  deriveBotState,
  type BotHeartbeat,
  type BotState,
} from "@/lib/discord-bot-heartbeat";
import type { BotPause } from "@/lib/discord-bot-control";

/**
 * What the review page can say about the standalone Discord bot.
 *
 * The bot's config lives in discord-bot/.env on whichever machine runs the bot.
 * That file is gitignored, so a deployed app - or a second checkout / worktree -
 * can never see it, and inspecting the filesystem alone reported "Not
 * configured" for a bot that was configured and running perfectly well.
 *
 * So the authoritative signal is the heartbeat the bot writes to the shared
 * database every few minutes (see recordBotHeartbeat in lib/data.ts): a check-in
 * proves the bot logged in, and carries the channel count with it. The local
 * .env inspection stays as a secondary hint for the machine that does host the
 * bot, and for a fresh clone that has not started it yet.
 */

export type { BotState };

export interface LocalEnvStatus {
  exists: boolean;
  tokenConfigured: boolean;
  channelsConfigured: boolean;
}

export interface BotStatus {
  state: BotState;
  heartbeat: BotHeartbeat | null;
  /** Milliseconds since the last check-in, or null if there has never been one. */
  sinceLastSeenMs: number | null;
  /**
   * The app-side pause switch, null if never toggled. Independent of `state`:
   * the switch persists in the database, so a paused bot that is restarted
   * comes back up still paused.
   */
  pause: BotPause | null;
  /**
   * What this server can see of the bot's local config. Null when there is no
   * discord-bot/.env here and no bot env vars in the process - i.e. this server
   * is not the machine that runs the bot, so its filesystem says nothing.
   */
  localEnv: LocalEnvStatus | null;
  envPath: string;
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function hasChannels(raw: string | undefined): boolean {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .some(Boolean);
}

/**
 * Best-effort look at bot config on THIS machine: discord-bot/.env first, then
 * the app's own environment (which is how you would configure it on a host with
 * no writable checkout). Returns null when neither says anything.
 */
function readLocalEnv(envPath: string): LocalEnvStatus | null {
  let parsed: Record<string, string> | null = null;
  try {
    parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
  } catch {
    parsed = null;
  }

  const token = (parsed?.DISCORD_BOT_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "").trim();
  const channels = parsed?.SPONSORSHIP_CHANNEL_IDS ?? process.env.SPONSORSHIP_CHANNEL_IDS;
  if (!parsed && !token && !hasChannels(channels)) return null;

  return {
    exists: parsed !== null,
    tokenConfigured: Boolean(token),
    channelsConfigured: hasChannels(channels),
  };
}

export async function readBotStatus(): Promise<BotStatus> {
  const envPath = path.join(process.cwd(), "discord-bot", ".env");
  let heartbeat: BotHeartbeat | null = null;
  let pause: BotPause | null = null;
  try {
    heartbeat = await getBotHeartbeat();
    pause = await getBotPause();
  } catch {
    heartbeat = null;
    pause = null;
  }

  return {
    ...deriveBotState(heartbeat, Date.now()),
    heartbeat,
    pause,
    localEnv: readLocalEnv(envPath),
    envPath,
  };
}
