import { ENV_PATH } from "./env.js";

/**
 * Human-readable setup instructions printed when no bot token is configured.
 * Kept as plain text so it renders fine in any terminal.
 */
export function setupHelp(): string {
  return [
    "==================================================================",
    "  Sponsor Engine Discord bot - setup required",
    "==================================================================",
    "",
    "No DISCORD_BOT_TOKEN was found, so the bot cannot connect yet.",
    "",
    "1. Create the application + bot:",
    "   - Go to https://discord.com/developers/applications",
    "   - New Application -> name it (e.g. Sponsor Engine)",
    "   - Open the 'Bot' tab -> Reset Token -> copy the token",
    "   - Under 'Privileged Gateway Intents', enable MESSAGE CONTENT INTENT",
    "     (required to read message text for /scrape and passive capture)",
    "",
    "2. Invite the bot to your server:",
    "   - Open the 'OAuth2 -> URL Generator' tab",
    "   - Scopes: check 'bot' AND 'applications.commands'",
    "   - Bot Permissions: 'Read Message History' and 'Send Messages'",
    "     (also 'View Channel' for the sponsorship channels)",
    "   - Open the generated URL and add the bot to your server",
    "",
    "3. Configure this bot locally:",
    `   - Copy discord-bot/.env.example to discord-bot/.env`,
    `     (expected at: ${ENV_PATH})`,
    "   - Set DISCORD_BOT_TOKEN=<your token>",
    "   - Set SPONSORSHIP_CHANNEL_IDS=<comma-separated channel IDs>",
    "     (enable Developer Mode in Discord, right-click a channel ->",
    "      Copy Channel ID)",
    "   - Optional: set DIGEST_CHANNEL_ID=<channel ID> to receive a daily",
    "     8am digest of overdue / due-today next actions in that channel.",
    "     When set, Mondays also get a weekly pipeline scoreboard post.",
    "     Override the hour with DIGEST_HOUR=<0-23> (default 8).",
    "   - Optional: set OWNER_DISCORD_MENTIONS=name=discordUserId,name=discordUserId",
    "     to map next-action owner names to Discord user IDs so the daily digest",
    "     @-mentions owners on their overdue items.",
    "",
    "4. Start the bot:",
    "   npm -C discord-bot run bot",
    "",
    "==================================================================",
  ].join("\n");
}
