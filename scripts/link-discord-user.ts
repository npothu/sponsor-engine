/**
 * Link (or unlink) a Discord account to an existing Sponsor Engine login, so
 * bot-driven mutations (/log, /prospect) attribute audit rows to a real
 * person instead of null/"system".
 *
 * Find the Discord user id with Discord's own "Copy User ID" (enable
 * Developer Mode in Discord settings, right-click the user).
 *
 * Run with: npm run link-discord-user -- --email x@y.com --discord-id 123456789012345678
 * Unlink with: npm run link-discord-user -- --email x@y.com --unlink
 */
import { loadEnv } from "./lib/env.mjs";

// Must run before lib/db.ts is ever imported - it reads process.env.turso_url
// synchronously at module load, so .env.local has to be loaded first (tsx,
// unlike `next dev`, does not auto-load .env.local).
loadEnv();

function parseArgs(argv: string[]): {
  email?: string;
  discordId?: string;
  unlink: boolean;
} {
  const out: { email?: string; discordId?: string; unlink: boolean } = {
    unlink: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") out.email = argv[++i];
    else if (arg === "--discord-id") out.discordId = argv[++i];
    else if (arg === "--unlink") out.unlink = true;
  }
  return out;
}

async function main() {
  const { ensureMigrated } = await import("../lib/db");
  const { getUserByEmail, setUserDiscordId } = await import("../lib/data");

  await ensureMigrated();

  const { email, discordId, unlink } = parseArgs(process.argv.slice(2));

  if (!email || (!unlink && !discordId)) {
    console.error(
      "Usage: npm run link-discord-user -- --email x@y.com --discord-id 123456789012345678",
    );
    console.error("       npm run link-discord-user -- --email x@y.com --unlink");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (!existing) {
    console.error(`No user found with email ${normalizedEmail}.`);
    process.exit(1);
  }

  let updated;
  try {
    updated = await setUserDiscordId(existing.id, unlink ? null : discordId!.trim());
  } catch (err) {
    console.error(
      `Failed to update user #${existing.id} - that Discord id may already be linked to another account.`,
    );
    console.error(err);
    process.exit(1);
  }
  if (!updated) {
    console.error(`Failed to update user #${existing.id}.`);
    process.exit(1);
  }

  if (unlink) {
    console.log(`Unlinked Discord account from #${updated.id} <${updated.email}>.`);
  } else {
    console.log(
      `Linked Discord id ${updated.discordUserId} to #${updated.id} <${updated.email}>.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
