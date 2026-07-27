import os from "node:os";
import { loadEnv, readConfig } from "./src/env.js";
import { setupHelp } from "./src/setup-help.js";

/**
 * Sponsor Engine Discord bot entry point.
 *
 * Startup order matters: load .env, then decide on the no-token path BEFORE
 * touching discord.js or the DB layer so a fresh clone can run this and get
 * clear setup help without any dependencies wired up.
 */

loadEnv();
const config = readConfig();

if (!config.token) {
  console.log(setupHelp());
  process.exit(0);
}

// Only now do we pull in discord.js and the (heavier) app data layer. The
// data-bridge import also chdir's to the repo root so the shared SQLite path
// resolves correctly.
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} = await import("discord.js");
type ChatInputInteraction =
  import("discord.js").ChatInputCommandInteraction;
type AutocompleteInteraction = import("discord.js").AutocompleteInteraction;
type Message = import("discord.js").Message;

const { data } = await import("./src/data-bridge.js");
const {
  buildDueReply,
  buildPipelineReply,
  buildCompanyReply,
  buildDigestMessage,
  buildWeeklyDigestMessage,
  runLog,
  runProspect,
  buildScrapeReply,
  CHANNEL_CHOICES,
  DIRECTION_CHOICES,
} = await import("./src/commands.js");
type CompanyPriority = import("../lib/schema.js").CompanyPriority;
type TouchpointChannel = import("../lib/schema.js").TouchpointChannel;
type TouchpointDirection = import("../lib/schema.js").TouchpointDirection;
type DiscordInboxInput = import("../lib/data.js").DiscordInboxInput;

const channelIdSet = new Set(config.channelIds);

// ---------------------------------------------------------------------------
// Slash command definitions
// ---------------------------------------------------------------------------

const commands = [
  new SlashCommandBuilder()
    .setName("due")
    .setDescription("Open next actions due in the next 7 days"),
  new SlashCommandBuilder()
    .setName("pipeline")
    .setDescription("Deal counts and asks per stage for the current cycle"),
  new SlashCommandBuilder()
    .setName("log")
    .setDescription("Log a touchpoint against a company")
    .addStringOption((o) =>
      o
        .setName("company")
        .setDescription("Company (start typing to search)")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((o) => {
      o
        .setName("channel")
        .setDescription("Interaction channel")
        .setRequired(true);
      for (const c of CHANNEL_CHOICES) o.addChoices({ name: c, value: c });
      return o;
    })
    .addStringOption((o) => {
      o
        .setName("direction")
        .setDescription("Outbound (you reached out) or inbound (they did)")
        .setRequired(true);
      for (const d of DIRECTION_CHOICES) o.addChoices({ name: d, value: d });
      return o;
    })
    .addStringOption((o) =>
      o
        .setName("summary")
        .setDescription("Short summary of the interaction")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("company")
    .setDescription("Show a compact company snapshot")
    .addStringOption((o) =>
      o
        .setName("company")
        .setDescription("Company (start typing to search)")
        .setRequired(true)
        .setAutocomplete(true),
    ),
  new SlashCommandBuilder()
    .setName("prospect")
    .setDescription("Quick-add a new sponsorship prospect")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Company name")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("website")
        .setDescription("Company website")
        .setRequired(false),
    )
    .addStringOption((o) => {
      o
        .setName("priority")
        .setDescription("Prospect priority")
        .setRequired(false);
      for (const p of ["high", "medium", "low"] as const) {
        o.addChoices({ name: p, value: p });
      }
      return o;
    })
    .addStringOption((o) =>
      o
        .setName("notes")
        .setDescription("Internal notes")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("scrape")
    .setDescription("Pull recent messages from the sponsorship channels into the inbox")
    .addIntegerOption((o) =>
      o
        .setName("limit")
        .setDescription("Messages to fetch per channel (default 100, max 100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(false),
    ),
].map((c) => c.toJSON());

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

async function registerCommands(applicationId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.token as string);
  try {
    if (config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(applicationId, config.guildId),
        { body: commands },
      );
      console.log(`Registered ${commands.length} guild command(s).`);
    } else {
      await rest.put(Routes.applicationCommands(applicationId), {
        body: commands,
      });
      console.log(
        `Registered ${commands.length} global command(s) (may take up to an hour to appear the first time).`,
      );
    }
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
}

// ---------------------------------------------------------------------------
// Inbox helpers
// ---------------------------------------------------------------------------

function toInboxInput(msg: Message): DiscordInboxInput {
  return {
    discordMessageId: msg.id,
    channelName:
      "name" in msg.channel && msg.channel.name ? msg.channel.name : null,
    author: msg.author?.tag ?? msg.author?.username ?? null,
    content: msg.content || null,
    postedAt: new Date(msg.createdTimestamp).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag}.`);
  if (channelIdSet.size === 0) {
    console.warn(
      "No SPONSORSHIP_CHANNEL_IDS configured - passive capture and /scrape will find no channels.",
    );
  } else {
    console.log(`Watching ${channelIdSet.size} channel(s) for sponsorship chatter.`);
  }
  startHeartbeat(ready.user.tag);
  scheduleDailyDigest();
  await registerCommands(ready.user.id);
});

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

/**
 * How often to re-publish the check-in. Comfortably under the app's staleness
 * window (DISCORD_BOT_HEARTBEAT_STALE_MS), so one missed write is not mistaken
 * for a stopped bot.
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

async function writeHeartbeat(botTag: string): Promise<void> {
  try {
    await data.recordBotHeartbeat({
      botTag,
      channelCount: channelIdSet.size,
      guildId: config.guildId,
      digestChannelId: config.digestChannelId,
      host: os.hostname(),
    });
  } catch (err) {
    console.error("Failed to write bot heartbeat:", err);
  }
}

/**
 * Publish a check-in to the shared database now, then every few minutes.
 *
 * This is how the web app knows the bot exists. Its config lives in
 * discord-bot/.env on this machine only - a deployed app cannot read that file,
 * so before the heartbeat the Discord page reported a perfectly healthy bot as
 * "Not configured". A check-in row in the shared database travels wherever the
 * app runs.
 */
function startHeartbeat(botTag: string): void {
  void writeHeartbeat(botTag);
  setInterval(() => void writeHeartbeat(botTag), HEARTBEAT_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Pause switch
// ---------------------------------------------------------------------------

/**
 * How long a pause lookup stays cached. Every visible act (command, capture,
 * digest) checks the switch, so a short cache keeps a chatty channel from
 * costing one DB read per message while still noticing an app-side flip within
 * about half a minute.
 */
const PAUSE_CACHE_MS = 30 * 1000;

let pauseCache: { paused: boolean; fetchedAt: number } | null = null;

/**
 * Whether the app has paused the bot (see lib/discord-bot-control.ts). The
 * switch lives in the shared database because that is the only channel a
 * deployed app has to this process. Fails open: a broken read means we act
 * unpaused rather than going dark on an infrastructure blip - if the DB is
 * truly down, every command fails loudly on its own anyway.
 */
async function isBotPaused(): Promise<boolean> {
  const now = Date.now();
  if (pauseCache && now - pauseCache.fetchedAt < PAUSE_CACHE_MS) {
    return pauseCache.paused;
  }
  let paused = false;
  try {
    paused = (await data.getBotPause())?.paused ?? false;
  } catch (err) {
    console.error("Failed to read the pause switch:", err);
  }
  pauseCache = { paused, fetchedAt: now };
  return paused;
}

// ---------------------------------------------------------------------------
// Actor attribution
// ---------------------------------------------------------------------------

/**
 * Resolve the Discord user invoking a command to an app user id (see
 * lib/data.ts getUserIdByDiscordId / scripts/link-discord-user.ts), so /log
 * and /prospect audit rows attribute to a real person. Falls back to null
 * (logged as "system / importer" in the audit trail) for an unlinked account
 * rather than blocking the command.
 */
async function resolveActorUserId(discordUserId: string): Promise<number | null> {
  try {
    return await data.getUserIdByDiscordId(discordUserId);
  } catch (err) {
    console.error("Failed to resolve Discord user to an app account:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Daily digest push
// ---------------------------------------------------------------------------

/** Milliseconds from now until the next occurrence of `hour`:00 local time. */
function msUntilNextHour(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/** Render and post the configured proactive digests to the configured channel. */
async function postDigest(): Promise<void> {
  if (!config.digestChannelId) return;
  if (await isBotPaused()) {
    console.log("Digest skipped - the bot is paused from the app.");
    return;
  }
  try {
    const channel = await client.channels.fetch(config.digestChannelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      console.warn("DIGEST_CHANNEL_ID is not a sendable text channel.");
      return;
    }

    if (new Date().getDay() === 1) {
      await channel.send(await buildWeeklyDigestMessage(data));
      console.log("Weekly digest posted.");
    }

    const message = await buildDigestMessage(data, config.ownerMentions);
    if (!message) {
      console.log("Daily digest: nothing overdue or due today - skipping post.");
      return;
    }
    await channel.send(message);
    console.log("Daily digest posted.");
  } catch (err) {
    console.error("Failed to post daily digest:", err);
  }
}

/**
 * Schedule the daily digest at config.digestHour local time (default 8am),
 * re-arming a 24h interval after the first fire. No-op when DIGEST_CHANNEL_ID is
 * unset, so the bot runs exactly as before for anyone who has not opted in.
 */
function scheduleDailyDigest(): void {
  if (!config.digestChannelId) {
    console.log(
      "No DIGEST_CHANNEL_ID configured - the daily digest push is disabled.",
    );
    return;
  }
  const delay = msUntilNextHour(config.digestHour);
  console.log(
    `Daily digest scheduled for ${config.digestHour}:00 local (in ${Math.round(
      delay / 60000,
    )} min), then every 24h.`,
  );
  setTimeout(() => {
    void postDigest();
    setInterval(() => void postDigest(), 24 * 60 * 60 * 1000);
  }, delay);
}

// Passive capture: store new messages posted in configured channels.
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author?.bot) return;
    if (!channelIdSet.has(msg.channelId)) return;
    if (!msg.content) return;
    if (await isBotPaused()) return;
    await data.insertDiscordInboxMessages([toInboxInput(msg)]);
  } catch (err) {
    console.error("Failed to capture message:", err);
  }
});

// ---------------------------------------------------------------------------
// Interaction handling
// ---------------------------------------------------------------------------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await isBotPaused()) {
      if (interaction.isAutocomplete()) {
        await interaction.respond([]);
      } else if (interaction.isRepliable()) {
        await interaction.reply({
          content:
            "The bot is paused from the Sponsor Engine app. Resume it on the Discord page there to use commands.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    await handleCommand(interaction);
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Something went wrong handling that command.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
});

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (!["company", "log"].includes(interaction.commandName) || focused.name !== "company") {
    await interaction.respond([]);
    return;
  }
  const query = String(focused.value ?? "").toLowerCase();
  const companies = await data.listCompanies(query ? { search: query } : undefined);
  const matches = companies
    .slice(0, 25)
    .map((c) => ({ name: c.name.slice(0, 100), value: String(c.id) }));
  await interaction.respond(matches);
}

async function handleCommand(interaction: ChatInputInteraction): Promise<void> {
  switch (interaction.commandName) {
    case "due":
      await interaction.reply({ content: await buildDueReply(data), flags: MessageFlags.Ephemeral });
      return;
    case "pipeline":
      await interaction.reply({ content: await buildPipelineReply(data), flags: MessageFlags.Ephemeral });
      return;
    case "company": {
      const companyId = Number(interaction.options.getString("company", true));
      if (!Number.isFinite(companyId)) {
        await interaction.reply({
          content: "Pick a company from the autocomplete list.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({ content: await buildCompanyReply(data, companyId), flags: MessageFlags.Ephemeral });
      return;
    }
    case "log": {
      const companyId = Number(interaction.options.getString("company", true));
      if (!Number.isFinite(companyId)) {
        await interaction.reply({
          content: "Pick a company from the autocomplete list.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const channel = interaction.options.getString("channel", true) as TouchpointChannel;
      const direction = interaction.options.getString("direction", true) as TouchpointDirection;
      const summary = interaction.options.getString("summary");
      const actorUserId = await resolveActorUserId(interaction.user.id);
      const reply = await runLog(data, { companyId, channel, direction, summary }, actorUserId);
      await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });
      return;
    }
    case "prospect": {
      const name = interaction.options.getString("name", true);
      const website = interaction.options.getString("website");
      const priority = interaction.options.getString("priority") as CompanyPriority | null;
      const notes = interaction.options.getString("notes");
      const actorUserId = await resolveActorUserId(interaction.user.id);
      const reply = await runProspect(
        data,
        {
          name,
          website,
          priority,
          notes,
          addedBy: interaction.user.username,
        },
        actorUserId,
      );
      await interaction.reply({ content: reply });
      return;
    }
    case "scrape": {
      const limit = interaction.options.getInteger("limit") ?? 100;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await scrapeChannels(limit);
      await interaction.editReply(buildScrapeReply(result));
      return;
    }
    default:
      await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
  }
}

async function scrapeChannels(limit: number): Promise<{
  fetched: number;
  inserted: number;
  channelsScanned: number;
  channelsSkipped: number;
}> {
  let fetched = 0;
  let inserted = 0;
  let channelsScanned = 0;
  let channelsSkipped = 0;

  for (const channelId of channelIdSet) {
    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch {
      channelsSkipped += 1;
      continue;
    }
    if (!channel || !channel.isTextBased() || !("messages" in channel)) {
      channelsSkipped += 1;
      continue;
    }

    try {
      const fetchedMsgs = await channel.messages.fetch({ limit: Math.min(limit, 100) });
      channelsScanned += 1;
      const batch: DiscordInboxInput[] = [];
      for (const msg of fetchedMsgs.values()) {
        if (msg.author?.bot) continue;
        if (!msg.content) continue;
        batch.push(toInboxInput(msg as Message));
      }
      fetched += batch.length;
      if (batch.length) inserted += await data.insertDiscordInboxMessages(batch);
    } catch {
      channelsSkipped += 1;
    }
  }

  return { fetched, inserted, channelsScanned, channelsSkipped };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

client.login(config.token).catch((err) => {
  console.error("Failed to log in. Is DISCORD_BOT_TOKEN valid?", err);
  process.exit(1);
});
