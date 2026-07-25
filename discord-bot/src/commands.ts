import type { DataLayer } from "./data-bridge.js";
import type {
  CompanyPriority,
  DealStage,
  TouchpointChannel,
  TouchpointDirection,
} from "../../lib/schema.js";

/**
 * Pure-ish command implementations. Each takes the data layer plus already-parsed
 * arguments and returns a compact string ready to send back to Discord. Keeping
 * the Discord.js interaction plumbing out of here makes the logic easy to follow.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local YYYY-MM-DD for a Date, matching how the app stores due dates. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function moneyShort(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function truncate(text: string | null | undefined, max: number): string {
  const value = (text ?? "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function formatOwnerPlain(owner: string | null | undefined): string {
  const value = owner?.trim();
  return value ? ` · ${value}` : "";
}

function formatOwnerMention(
  owner: string | null | undefined,
  ownerMentions: Record<string, string>,
): string {
  const value = owner?.trim();
  if (!value) return "";
  const id = ownerMentions[value.toLowerCase()];
  return id ? ` <@${id}>` : ` · ${value}`;
}

/** All pipeline stages in canonical order (for /pipeline output). */
const STAGE_ORDER: DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
];

// ---------------------------------------------------------------------------
// /due
// ---------------------------------------------------------------------------

export async function buildDueReply(data: DataLayer): Promise<string> {
  const actions = await data.listDueActions();
  const today = isoDate(new Date());
  const weekEnd = isoDate(new Date(Date.now() + 7 * DAY_MS));

  const overdue: string[] = [];
  const dueToday: string[] = [];
  const dueWeek: string[] = [];

  for (const a of actions) {
    const line =
      `- **${a.company.name}**: ${a.title} _(due ${a.dueDate})_` +
      formatOwnerPlain(a.owner);
    if (a.dueDate < today) overdue.push(line);
    else if (a.dueDate === today) dueToday.push(line);
    else if (a.dueDate <= weekEnd) dueWeek.push(line);
  }

  if (!overdue.length && !dueToday.length && !dueWeek.length) {
    return "**Next actions** - nothing due in the next 7 days. All clear.";
  }

  const parts: string[] = ["**Next actions due (next 7 days)**"];
  if (overdue.length) parts.push(`\n__Overdue (${overdue.length})__\n${overdue.join("\n")}`);
  if (dueToday.length) parts.push(`\n__Today (${dueToday.length})__\n${dueToday.join("\n")}`);
  if (dueWeek.length) parts.push(`\n__This week (${dueWeek.length})__\n${dueWeek.join("\n")}`);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Daily digest (proactive push)
// ---------------------------------------------------------------------------

/**
 * Build the daily digest of overdue and due-today next actions, or null when
 * there is nothing pressing (so the scheduler can skip posting an empty digest).
 * Overdue lines are listed most-overdue first; due-today follows. Shares the
 * same isoDate day-boundary logic the app and /due use.
 */
export async function buildDigestMessage(
  data: DataLayer,
  ownerMentions: Record<string, string>,
): Promise<string | null> {
  const actions = await data.listDueActions();
  const today = isoDate(new Date());

  const overdue: string[] = [];
  const dueToday: string[] = [];

  for (const a of actions) {
    const due = a.dueDate.slice(0, 10);
    const line =
      `- **${a.company.name}**: ${a.title} _(due ${due})_` +
      formatOwnerMention(a.owner, ownerMentions);
    if (due < today) overdue.push(line);
    else if (due === today) dueToday.push(line);
  }

  if (!overdue.length && !dueToday.length) return null;

  const parts: string[] = [`**Sponsorship digest - ${today}**`];
  if (overdue.length) {
    parts.push(`\n__Overdue (${overdue.length})__\n${overdue.join("\n")}`);
  }
  if (dueToday.length) {
    parts.push(`\n__Due today (${dueToday.length})__\n${dueToday.join("\n")}`);
  }
  parts.push("\n_Work these in Sponsor Engine. Reply-driven items detach cadences automatically._");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Weekly digest (proactive push)
// ---------------------------------------------------------------------------

export async function buildWeeklyDigestMessage(data: DataLayer): Promise<string> {
  const sb = await data.weeklyScoreboard(new Date(Date.now() - DAY_MS));
  const cycle = await data.getCurrentCycle();
  const summary = await data.revenueSummary(cycle);
  const replyPct = sb.replyStarted > 0 ? Math.round(sb.replyRate * 100) : 0;
  const totals =
    `Committed **${moneyShort(summary.committedTotal)}**` +
    ` · Weighted **${moneyShort(summary.weightedPipeline)}**` +
    ` · Goal ${moneyShort(summary.goal)}` +
    ` · Anchors ${summary.anchorCount}/${summary.anchorTarget}`;

  return [
    `**Weekly sponsorship scoreboard - week of ${sb.weekStart}**`,
    `New companies touched: **${sb.newTouches}**/${sb.newTouchQuota}`,
    `Follow-ups sent: **${sb.followUpsSent}**`,
    `Due actions completed: **${sb.dueCompleted}**/${sb.dueTotal}`,
    `Meetings booked: **${sb.meetingsBooked}**`,
    `Deals advanced (stage moves): **${sb.dealsAdvanced}**`,
    `Reply rate (trailing 30d): **${replyPct}%** (${sb.replyReplied} of ${sb.replyStarted} threads)`,
    `Pipeline snapshot - ${cycle}: ${totals}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// /pipeline
// ---------------------------------------------------------------------------

export async function buildPipelineReply(data: DataLayer): Promise<string> {
  const cycle = await data.getCurrentCycle();
  const summary = await data.revenueSummary(cycle);
  const byStage = new Map(summary.byStage.map((s) => [s.stage, s]));

  const lines: string[] = [];
  for (const stage of STAGE_ORDER) {
    const row = byStage.get(stage);
    if (!row || row.count === 0) continue;
    const value = row.committed + row.weighted;
    const suffix = value > 0 ? ` - ${moneyShort(value)}` : "";
    lines.push(`- ${stage}: **${row.count}**${suffix}`);
  }

  const header = `**Pipeline - ${cycle}**`;
  const totals =
    `Committed **${moneyShort(summary.committedTotal)}**` +
    ` · Weighted **${moneyShort(summary.weightedPipeline)}**` +
    ` · Goal ${moneyShort(summary.goal)}` +
    ` · Anchors ${summary.anchorCount}/${summary.anchorTarget}`;

  if (!lines.length) {
    return `${header}\n${totals}\n_No deals in this cycle yet._`;
  }
  return `${header}\n${totals}\n\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// /company
// ---------------------------------------------------------------------------

export async function buildCompanyReply(
  data: DataLayer,
  companyId: number,
): Promise<string> {
  const detail = await data.getCompanyDetail(companyId);
  if (!detail) return `Could not find a company with id ${companyId}.`;

  const cycle = await data.getCurrentCycle();
  const deal =
    detail.deals.find((d) => d.cycle === cycle) ?? detail.deals[0] ?? null;
  const headerBits = [
    `**${detail.company.name}**`,
    detail.company.type,
    detail.company.priority ? `priority ${detail.company.priority}` : null,
    detail.company.website,
  ].filter(Boolean);

  const lines: string[] = [headerBits.join(" · ")];
  if (deal) {
    const ask = deal.askAmount
      ? moneyShort(deal.askAmount)
      : deal.tier
        ? `${deal.tier.name} ${moneyShort(deal.tier.price)}`
        : "no ask set";
    lines.push(`Deal: ${deal.cycle} · ${deal.stage} · ${ask}`);
  } else {
    lines.push("Deal: no deals yet.");
  }

  const touch = detail.touchpoints[0];
  if (touch) {
    lines.push(
      `Last touchpoint: ${touch.direction} ${touch.channel} ${touch.occurredAt.slice(
        0,
        10,
      )} - ${truncate(touch.summary, 80) || "no summary"}`,
    );
  }

  if (detail.openActions.length) {
    lines.push("\nOpen actions:");
    for (const a of detail.openActions.slice(0, 5)) {
      const owner = a.owner?.trim() ? `, ${a.owner.trim()}` : "";
      lines.push(`- ${a.title} (due ${a.dueDate}${owner})`);
    }
    if (detail.openActions.length > 5) {
      lines.push(`- +${detail.openActions.length - 5} more`);
    }
  }

  if (detail.contacts.length) {
    const warmthRank = { hot: 0, warm: 1, cold: 2 } as const;
    const champion = deal?.championContactId
      ? detail.contacts.find((c) => c.id === deal.championContactId) ?? null
      : null;
    const ordered = [
      ...(champion ? [champion] : []),
      ...detail.contacts
        .filter((c) => c.id !== champion?.id)
        .sort((a, b) => {
          const aw = warmthRank[a.warmth as keyof typeof warmthRank] ?? 2;
          const bw = warmthRank[b.warmth as keyof typeof warmthRank] ?? 2;
          return aw - bw || a.name.localeCompare(b.name);
        }),
    ];

    lines.push("\nContacts:");
    for (const c of ordered.slice(0, 3)) {
      const championLabel = c.id === champion?.id ? " (champion)" : "";
      const role = c.role?.trim() ? ` - ${c.role.trim()}` : "";
      const email = c.email?.trim() ? ` (${c.email.trim()})` : "";
      lines.push(`- ${c.name}${championLabel}${role}${email}`);
    }
    if (ordered.length > 3) lines.push(`- +${ordered.length - 3} more`);
  }

  return truncate(lines.join("\n"), 1900);
}

// ---------------------------------------------------------------------------
// /log
// ---------------------------------------------------------------------------

export interface LogArgs {
  companyId: number;
  channel: TouchpointChannel;
  direction: TouchpointDirection;
  summary: string | null;
}

export async function runLog(data: DataLayer, args: LogArgs): Promise<string> {
  const companies = await data.listCompanies();
  const company = companies.find((c) => c.id === args.companyId);
  if (!company) {
    return `Could not find a company with id ${args.companyId}.`;
  }
  await data.logTouchpoint({
    companyId: args.companyId,
    channel: args.channel,
    direction: args.direction,
    summary: args.summary,
  });
  const dir = args.direction === "inbound" ? "inbound" : "outbound";
  return `Logged ${dir} ${args.channel} touchpoint for **${company.name}**.`;
}

// ---------------------------------------------------------------------------
// /prospect
// ---------------------------------------------------------------------------

export interface ProspectArgs {
  name: string;
  website: string | null;
  priority: CompanyPriority | null;
  notes: string | null;
  addedBy: string;
}

export async function runProspect(
  data: DataLayer,
  args: ProspectArgs,
): Promise<string> {
  const byName = await data.findCompanyByNormalizedName(args.name);
  const existing = byName ?? (await data.findCompanyByHost(args.website));
  if (existing) {
    return (
      `**${existing.name}** is already tracked (priority ${existing.priority}). ` +
      "Use /company to see where it stands."
    );
  }

  const company = await data.createCompany({
    name: args.name,
    website: args.website,
    priority: args.priority ?? undefined,
    notes: args.notes,
    source: "discord",
  });
  await data.createDeal({
    companyId: company.id,
    cycle: await data.getCurrentCycle(),
    stage: "prospect",
  });

  const priority = args.priority ?? company.priority;
  const website = args.website?.trim() ? ` · ${args.website.trim()}` : "";
  return (
    `Added **${company.name}** as a prospect (${priority} priority)` +
    `${website} - added by ${args.addedBy}.`
  );
}

// ---------------------------------------------------------------------------
// /scrape (message shaping happens in bot.ts; this just formats the reply)
// ---------------------------------------------------------------------------

export interface ScrapeResult {
  fetched: number;
  inserted: number;
  channelsScanned: number;
  channelsSkipped: number;
}

export function buildScrapeReply(result: ScrapeResult): string {
  if (result.channelsScanned === 0) {
    return (
      "No sponsorship channels are configured or reachable. Set " +
      "`SPONSORSHIP_CHANNEL_IDS` in discord-bot/.env and make sure the bot " +
      "can view those channels."
    );
  }
  const dup = result.fetched - result.inserted;
  return (
    `Scraped **${result.fetched}** message(s) from ${result.channelsScanned} ` +
    `channel(s) -> **${result.inserted}** new in the inbox` +
    (dup > 0 ? `, ${dup} already captured` : "") +
    (result.channelsSkipped > 0
      ? `. (${result.channelsSkipped} configured channel(s) could not be read.)`
      : ".")
  );
}

/** Choice lists for slash-command options, kept in sync with the schema unions. */
export const CHANNEL_CHOICES: TouchpointChannel[] = [
  "email",
  "call",
  "meeting",
  "career_fair",
  "linkedin",
  "discord",
  "other",
];

export const DIRECTION_CHOICES: TouchpointDirection[] = ["outbound", "inbound"];
