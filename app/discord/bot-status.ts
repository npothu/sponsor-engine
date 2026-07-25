import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Best-effort inspection of the standalone bot's local config. We only read the
 * .env file that sits next to the bot (discord-bot/.env) so the review page can
 * show whether it looks configured. This never imports the bot itself.
 */

export interface BotStatus {
  envExists: boolean;
  tokenConfigured: boolean;
  channelsConfigured: boolean;
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

export function readBotStatus(): BotStatus {
  const envPath = path.join(process.cwd(), "discord-bot", ".env");
  let envExists = false;
  let tokenConfigured = false;
  let channelsConfigured = false;

  try {
    const raw = fs.readFileSync(envPath, "utf8");
    envExists = true;
    const parsed = parseEnv(raw);
    tokenConfigured = Boolean((parsed.DISCORD_BOT_TOKEN ?? "").trim());
    channelsConfigured = (parsed.SPONSORSHIP_CHANNEL_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .some(Boolean);
  } catch {
    envExists = false;
  }

  return { envExists, tokenConfigured, channelsConfigured, envPath };
}
