"use server";

import {
  getCurrentCycle,
  listReAskCommitments,
  listTiers,
  revenueSummary,
  fulfillmentHealth,
  DEAL_SATISFACTION_LABEL,
  type DealSatisfaction,
  type FulfillmentHealthRow,
} from "@/lib/data";
import {
  buildRelationshipState,
  channelLabel,
  formatDate,
  formatDollars,
  listCompaniesWithDeals,
  listTopOpenThreads,
  stageLabel,
  type RelationshipState,
} from "./lib";

/**
 * Builds the full handoff briefing as a single Markdown document. Every full
 * sentence sits on its own line, and only plain dashes are used (never an
 * em dash), per the org's writing convention.
 */
export async function buildHandoffMarkdown(): Promise<string> {
  const cycle = await getCurrentCycle();
  const tiers = await listTiers(true);
  const revenue = await revenueSummary(cycle);
  const threads = await listTopOpenThreads(cycle, 8);
  const companies = await listCompaniesWithDeals();
  const relationships = await Promise.all(
    companies.map((c) => buildRelationshipState(c)),
  );
  const reAsks = await listReAskCommitments();
  // Delivered-vs-owed + satisfaction per committed sponsor, keyed by company so
  // each company section can show its fulfillment health at a glance.
  const healthByCompany = new Map<number, FulfillmentHealthRow>(
    (await fulfillmentHealth(cycle)).map((h) => [h.companyId, h]),
  );

  const lines: string[] = [];

  lines.push(`# Sponsor Engine handoff - ${cycle}`);
  lines.push("");
  lines.push(`Generated ${formatDate(new Date().toISOString())}.`);
  lines.push("");

  lines.push("## Role and cycle");
  lines.push("");
  lines.push(
    "The pipeline owner runs sponsorship end to end: prospecting companies, running the deal pipeline through commitment, and fulfilling what was promised.",
  );
  lines.push(`The current cycle is ${cycle}.`);
  lines.push("The anchor goal is 2 to 3 Gold-level sponsors.");
  lines.push("");

  lines.push("## Totals");
  lines.push("");
  lines.push(`- Companies tracked: ${companies.length}`);
  lines.push(`- Committed this cycle: ${formatDollars(revenue.committedTotal)}`);
  lines.push(`- Weighted pipeline: ${formatDollars(revenue.weightedPipeline)}`);
  lines.push(`- Revenue goal: ${formatDollars(revenue.goal)}`);
  lines.push(`- Anchor sponsors: ${revenue.anchorCount} of ${revenue.anchorTarget || "-"}`);
  lines.push("");

  lines.push("## Tier structure");
  lines.push("");
  if (tiers.length === 0) {
    lines.push("No active tiers configured.");
  } else {
    for (const t of tiers) {
      const desc = t.description ? ` - ${t.description}` : "";
      lines.push(`- ${t.name} (${formatDollars(t.price)})${desc}`);
    }
  }
  lines.push("");

  lines.push("## Top open threads");
  lines.push("");
  if (threads.length === 0) {
    lines.push("No active deals in the current cycle.");
  } else {
    for (const t of threads) {
      lines.push(`### ${t.companyName}`);
      lines.push("");
      lines.push(`Stage: ${stageLabel(t.stage)} in ${t.cycle}.`);
      lines.push(`Ask: ${formatDollars(t.askAmount)}.`);
      lines.push(
        t.latestTouchpoint
          ? `Last touch: ${channelLabel(t.latestTouchpoint.channel)} on ${formatDate(t.latestTouchpoint.occurredAt)}.`
          : "Last touch: none logged yet.",
      );
      lines.push(
        t.nextAction
          ? `Next action: ${t.nextAction.title}, due ${formatDate(t.nextAction.dueDate)}.`
          : "Next action: none open.",
      );
      lines.push("");
    }
  }

  lines.push("## Promised re-asks");
  lines.push("");
  lines.push(
    "Companies that asked us to come back on a specific date, whether or not they ever had a deal.",
  );
  lines.push(
    "These promises survive board turnover, so honor them the week they come due.",
  );
  lines.push("");
  if (reAsks.length === 0) {
    lines.push("No promised re-asks on record.");
    lines.push("");
  } else {
    for (const r of reAsks) {
      const reasonPart = r.reAskReason ? ` - ${r.reAskReason}` : "";
      const contactPart = r.contact ? ` (per ${r.contact.name})` : "";
      lines.push(
        `- ${r.company.name}: ask again on ${formatDate(r.reAskOn)}${reasonPart}${contactPart}.`,
      );
    }
    lines.push("");
  }

  lines.push("## State of the relationship");
  lines.push("");
  if (relationships.length === 0) {
    lines.push("No companies have a deal yet.");
    lines.push("");
  } else {
    for (const r of relationships) {
      lines.push(
        ...renderCompanySection(r, healthByCompany.get(r.detail.company.id) ?? null),
      );
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function satisfactionLabel(s: DealSatisfaction | null): string {
  return s ? DEAL_SATISFACTION_LABEL[s] : "not assessed";
}

function renderCompanySection(
  state: RelationshipState,
  health: FulfillmentHealthRow | null,
): string[] {
  const { detail, latestTouchpoint, touchpointCount, firstTouchAt, lastTouchAt, deliverables } =
    state;
  const { company, contacts, deals, openActions } = detail;
  const primaryDeal = deals[0] ?? null;
  const lines: string[] = [];

  lines.push(`### ${company.name}`);
  lines.push("");
  lines.push(`Type: ${company.type === "corporate" ? "Corporate" : "Community"}.`);
  lines.push(
    primaryDeal
      ? `Status: currently ${stageLabel(primaryDeal.stage).toLowerCase()} in ${primaryDeal.cycle}.`
      : "Status: no deal on record.",
  );
  lines.push(
    latestTouchpoint
      ? `Last contacted via ${channelLabel(latestTouchpoint.channel)} on ${formatDate(latestTouchpoint.occurredAt)}.`
      : "No touchpoints logged yet.",
  );
  lines.push(
    `Touchpoints: ${touchpointCount} total${firstTouchAt ? `, spanning ${formatDate(firstTouchAt)} to ${formatDate(lastTouchAt)}` : ""}.`,
  );
  lines.push(
    latestTouchpoint?.deckVersion
      ? `Last deck seen: ${latestTouchpoint.deckVersion.label}.`
      : "No deck version on record.",
  );
  lines.push("");

  lines.push("Deal history:");
  if (deals.length === 0) {
    lines.push("- None.");
  } else {
    for (const d of deals) {
      const tierPart = d.tier ? ` (${d.tier.name})` : "";
      lines.push(`- ${d.cycle}: ${stageLabel(d.stage)}${tierPart}, ask ${formatDollars(d.askAmount)}.`);
    }
  }
  lines.push("");

  lines.push("Contact roster:");
  if (contacts.length === 0) {
    lines.push("- None on file.");
  } else {
    for (const c of contacts) {
      const rolePart = c.role ? `, ${c.role}` : "";
      lines.push(`- ${c.name}${rolePart} (${c.warmth}).`);
    }
  }
  lines.push("");

  lines.push("What is owed:");
  if (deliverables.length === 0) {
    lines.push("- No open deliverables.");
  } else {
    for (const d of deliverables) {
      const ownerPart = d.owner ? ` (${d.owner})` : "";
      const duePart = d.dueDate ? `, due ${formatDate(d.dueDate)}` : "";
      lines.push(`- ${d.title}${ownerPart}${duePart} - ${d.status}.`);
    }
  }
  // Delivered-vs-owed + satisfaction, for committed sponsors, so a successor sees
  // fulfillment health and renewal risk at a glance.
  if (health) {
    const overduePart =
      health.overdue > 0 ? `, ${health.overdue} overdue` : "";
    lines.push(
      `Fulfillment: ${health.done} of ${health.total} delivered${overduePart}, ${health.proofCaptured} with proof captured.`,
    );
    lines.push(
      `Sponsor satisfaction: ${satisfactionLabel(health.satisfaction)}.`,
    );
  }
  lines.push("");

  lines.push("Open next actions:");
  if (openActions.length === 0) {
    lines.push("- None open.");
  } else {
    for (const a of openActions) {
      lines.push(`- ${a.title}, due ${formatDate(a.dueDate)}.`);
    }
  }
  lines.push("");

  return lines;
}
