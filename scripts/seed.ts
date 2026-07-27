/**
 * Idempotent seed script for Sponsor Engine.
 *
 * Run with: npm run seed
 *
 * Exits early (no-op) if ANY company already exists, so it is safe to run
 * repeatedly. Seeds deck versions, tiers (legacy + active), add-ons, templates,
 * a default cadence, and four fictional demo deals with touchpoints and next
 * actions, so a fresh install has something to click through.
 *
 * Every company here is invented. Replace them with your own once you have real
 * pipeline, or run `npm run reset-prospects` to clear them out.
 *
 * NOTE: creates ZERO contacts on purpose - no invented personal info.
 */
import { addDays, formatISO } from "date-fns";
import { eq } from "drizzle-orm";
import { db, ensureMigrated } from "../lib/db";
import {
  addons,
  cadences,
  cadenceSteps,
  companies,
  cycles,
  deals,
  deckVersions,
  deliverableTemplates,
  nextActions,
  settings,
  templates,
  tiers,
  touchpoints,
} from "../lib/schema";

function dueInDays(days: number): string {
  return formatISO(addDays(new Date(), days), { representation: "date" });
}

/**
 * Ensure a single setting key exists, only writing it when absent so we never
 * clobber a value that was changed in the UI.
 */
async function seedSetting(key: string, value: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key));
  if (!existing) {
    await db.insert(settings).values({ key, value });
  }
}

/**
 * Additive, per-table settings/cycles seed. Runs on every invocation (even when
 * companies already exist) but only fills keys/rows that are missing, so it is
 * safe against a live database with real user data.
 */
async function seedSettingsAndCycles(): Promise<void> {
  await seedSetting("current_cycle", "2026-27");
  await seedSetting("revenue_goal", "10000");
  await seedSetting("anchor_target", "3");
  await seedSetting("weekly_launch_quota", "10");
  await seedSetting("your_name", "Your Name");
  await seedSetting("org_name", "Lakeside Engineering Society");

  // Proof-point merge fields. current_sponsors and anchor_event are left unset
  // so they compute from live committed deals / the active cycle by default.
  await seedSetting("member_count", "400 members");
  await seedSetting("hackathon_reach", "200+ hackathon participants");

  const [existingCycle] = await db
    .select()
    .from(cycles)
    .where(eq(cycles.label, "2026-27"));
  if (!existingCycle) {
    await db.insert(cycles).values({
      label: "2026-27",
      anchorEvent: "Spring 2027 Hackathon",
      anchorEventDate: "2027-04-10",
      isActive: true,
    });
  }
}

/**
 * Additive deliverable-template seed. For each active tier (Bronze/Silver/Gold)
 * that has no deliverable templates yet, insert its checklist. Higher tiers are
 * cumulative supersets of lower ones. Idempotent per tier.
 */
async function seedDeliverableTemplates(): Promise<void> {
  const bronze = [
    "Resume book access",
    "Social media post",
    "Job posting advertisements",
    "Soiree invite",
  ];
  const silverExtra = [
    "Info session or resume workshop",
    "Mock interviews / coffee chats",
    "T-shirt logo",
  ];
  const goldExtra = [
    "Partnered event 1",
    "Partnered event 2",
    "Hackathon title/track naming",
    "Priority recruiting-season scheduling",
    "First pick of a la carte",
    "Year-round branding",
  ];
  const silver = [...bronze, ...silverExtra];
  const gold = [...silver, ...goldExtra];
  const byTierName: Record<string, string[]> = { Bronze: bronze, Silver: silver, Gold: gold };

  const activeTiers = await db
    .select()
    .from(tiers)
    .where(eq(tiers.active, true));

  for (const tier of activeTiers) {
    const titles = byTierName[tier.name];
    if (!titles) continue;
    const [existing] = await db
      .select()
      .from(deliverableTemplates)
      .where(eq(deliverableTemplates.tierId, tier.id));
    if (existing) continue;
    await db.insert(deliverableTemplates).values(
      titles.map((title, i) => ({
        tierId: tier.id,
        title,
        defaultOwner: null,
        position: i,
      })),
    );
  }
}

async function main() {
  // lib/db.ts's async client no longer runs the idempotent schema migration
  // automatically on import (the old better-sqlite3 connection did) - callers
  // outside lib/data.ts's request path must await it explicitly once.
  await ensureMigrated();

  // Settings and cycles are seeded additively regardless of whether the core
  // company data already exists, so upgrading a live database backfills them.
  await seedSettingsAndCycles();

  const existing = await db.select().from(companies);
  if (existing.length > 0) {
    // Core data present: still backfill per-table additions that may be new.
    await seedDeliverableTemplates();
    console.log(
      `Seed: ${existing.length} company(ies) already present; backfilled settings, cycle, and deliverable templates.`,
    );
    return;
  }

  console.log("Seeding Sponsor Engine...");

  // -----------------------------------------------------------------------
  // Deck versions
  // -----------------------------------------------------------------------
  const [publishedDeck] = await db
    .insert(deckVersions)
    .values({
      label: "2026-27 Published Packet",
      description:
        "The published sponsorship packet shared with sponsors for the 2026-27 cycle.",
      releasedAt: formatISO(new Date()),
      url: "https://example.com/sponsorship-packet",
      isCurrent: true,
    })
    .returning();

  await db
    .insert(deckVersions)
    .values({
      label: "Add-ons working draft",
      description:
        "Internal working draft exploring the revamped tiers and a la carte add-ons. Not yet published.",
      releasedAt: formatISO(new Date()),
      isCurrent: false,
    })
    .returning();

  // -----------------------------------------------------------------------
  // Tiers - legacy (inactive) published set
  // -----------------------------------------------------------------------
  const legacyPackage = "2026-27 published packet";
  await db.insert(tiers).values([
    {
      name: "Silver",
      price: 500,
      description: "Legacy published Silver tier.",
      position: 1,
      active: false,
      packageLabel: legacyPackage,
    },
    {
      name: "Gold",
      price: 1000,
      description: "Legacy published Gold tier.",
      position: 2,
      active: false,
      packageLabel: legacyPackage,
    },
    {
      name: "Platinum",
      price: 2000,
      description: "Legacy published Platinum tier.",
      position: 3,
      active: false,
      packageLabel: legacyPackage,
    },
  ]);

  // -----------------------------------------------------------------------
  // Tiers - active working (revamp draft) set
  // -----------------------------------------------------------------------
  const revampPackage = "2026-27 revamp draft";
  await db.insert(tiers).values({
    name: "Bronze",
    price: 500,
    description: "Entry-level partnership: logo placement and event mentions.",
    position: 1,
    active: true,
    packageLabel: revampPackage,
  });
  const [silverActive] = await db
    .insert(tiers)
    .values({
      name: "Silver",
      price: 1000,
      description:
        "Mid-tier partnership: info session, expanded branding, and one partnered event.",
      position: 2,
      active: true,
      packageLabel: revampPackage,
    })
    .returning();
  const [goldActive] = await db
    .insert(tiers)
    .values({
      name: "Gold",
      price: 2000,
      description:
        "Hackathon title/track naming; 2+ partnered events; first pick of a la carte add-ons; year-round branding.",
      position: 3,
      active: true,
      packageLabel: revampPackage,
    })
    .returning();

  // -----------------------------------------------------------------------
  // A la carte add-ons
  // -----------------------------------------------------------------------
  await db.insert(addons).values([
    {
      name: "Extra info session",
      description: "An additional dedicated info session with members.",
      priceNote: "from $300",
    },
    {
      name: "Dedicated mixer / hospitality suite",
      description:
        "A dedicated networking mixer or hospitality suite at one of our events.",
      priceNote: "from $750",
    },
    {
      name: "Hackathon track naming",
      description: "Name a hackathon track after the sponsor.",
      priceNote: "from $1,500",
    },
    {
      name: "Targeted resume book cut",
      description:
        "A filtered cut of the member resume book targeted to the sponsor's roles.",
      priceNote: "from $400",
    },
    {
      name: "Recruiting a la carte bundle",
      description:
        "Bundled recruiting touchpoints: resume book, targeted outreach, and priority scheduling.",
      priceNote: "from $1,200",
    },
  ]);

  // -----------------------------------------------------------------------
  // Companies + deals (cycle 2026-27)
  // -----------------------------------------------------------------------
  const cycle = "2026-27";

  // Northwind Systems - corporate, negotiating, targeting active Gold
  const [northwind] = await db
    .insert(companies)
    .values({
      name: "Northwind Systems",
      type: "corporate",
      website: "https://northwind.example.com",
      source: "cold_research",
      notes: "Priority corporate target for the hackathon anchor sponsorship.",
    })
    .returning();

  const [northwindDeal] = await db
    .insert(deals)
    .values({
      companyId: northwind.id,
      cycle,
      stage: "negotiating",
      targetTierId: goldActive.id,
      customTerms:
        "Hackathon track sponsorship anchor ask + recruiting a la carte upsell",
    })
    .returning();

  await db.insert(touchpoints).values({
    companyId: northwind.id,
    dealId: northwindDeal.id,
    channel: "email",
    direction: "outbound",
    occurredAt: formatISO(new Date()),
    summary: "Sent published packet, discussing tier + add-ons",
    deckVersionId: publishedDeck.id,
  });

  await db.insert(nextActions).values({
    dealId: northwindDeal.id,
    title: "Follow up on tier and a la carte discussion",
    dueDate: dueInDays(3),
    status: "open",
    createdBy: "manual",
  });

  // Riverbend Collective - community, conversation
  const [riverbend] = await db
    .insert(companies)
    .values({
      name: "Riverbend Collective",
      type: "community",
      source: "peer_org_sponsor",
      notes: "Community/member-benefit partnership, not corporate recruiting",
    })
    .returning();

  await db.insert(deals).values({
    companyId: riverbend.id,
    cycle,
    stage: "conversation",
    customTerms:
      "Community/member-benefit partnership, not corporate recruiting",
  });

  // Cobalt Energy - corporate, fulfilling (current sponsor)
  const [cobalt] = await db
    .insert(companies)
    .values({
      name: "Cobalt Energy",
      type: "corporate",
      website: "https://cobaltenergy.example.com",
      source: "career_fair",
      notes: "Current sponsor, fulfilling 2026-27 deliverables.",
    })
    .returning();

  const [cobaltDeal] = await db
    .insert(deals)
    .values({
      companyId: cobalt.id,
      cycle,
      stage: "fulfilling",
      targetTierId: silverActive.id,
      askAmount: silverActive.price,
    })
    .returning();

  await db.insert(nextActions).values({
    dealId: cobaltDeal.id,
    title: "Confirm fall deliverables kickoff",
    dueDate: dueInDays(7),
    status: "open",
    createdBy: "manual",
  });

  // Meridian Labs - corporate, fulfilling (current sponsor)
  const [meridian] = await db
    .insert(companies)
    .values({
      name: "Meridian Labs",
      type: "corporate",
      website: "https://meridianlabs.example.com",
      source: "alumni_employer",
      notes: "Current sponsor, fulfilling 2026-27 deliverables.",
    })
    .returning();

  const [meridianDeal] = await db
    .insert(deals)
    .values({
      companyId: meridian.id,
      cycle,
      stage: "fulfilling",
      targetTierId: silverActive.id,
      askAmount: silverActive.price,
    })
    .returning();

  await db.insert(nextActions).values({
    dealId: meridianDeal.id,
    title: "Confirm fall deliverables kickoff",
    dueDate: dueInDays(7),
    status: "open",
    createdBy: "manual",
  });

  // -----------------------------------------------------------------------
  // Templates - professional student-org voice
  // -----------------------------------------------------------------------
  const signature =
    "{{your_name}}\nSponsorship Chair, {{org_name}}\nsponsorship@example.org";

  await db.insert(templates).values([
      {
        name: "Cold intro",
        scenario: "cold intro",
        subject: "{{org_name}} x {{company}} - sponsorship partnership for 2026-27",
        body: `Hi {{contact_first_name}},

I'm the Sponsorship Chair at {{org_name}}, a student engineering organization {{member_count}} strong. I'm reaching out {{personalization_hook}}, and we're building our 2026-27 sponsor partnerships where I think {{company}} would be a great fit for our community of technical students.

Partners like {{current_sponsors}} already work with us on recruiting access, event branding, and {{anchor_event}}, which reaches {{hackathon_reach}}. I'd love to share our sponsorship packet and find 20 minutes to walk you through the {{tier_name}} tier ({{tier_price}}) and how we can tailor it to your goals.

Would you be open to a quick call in the next week or two?

Best regards,
${signature}`,
      },
      {
        name: "Follow-up (no reply)",
        scenario: "follow-up",
        subject: "Following up - {{org_name}} x {{company}} sponsorship",
        body: `Hi {{contact_first_name}},

Just floating this back to the top of your inbox. I know things get busy, so no worries at all if the timing isn't right.

We're finalizing our 2026-27 sponsor lineup at {{org_name}} and I'd still love to explore how {{company}} could partner with us - the {{tier_name}} tier in particular. Happy to send over the packet or hop on a short call whenever works for you.

Thanks so much,
${signature}`,
      },
      {
        name: "Post-career-fair",
        scenario: "post-career-fair",
        subject: "Great meeting you - {{org_name}} x {{company}}",
        body: `Hi {{contact_first_name}},

It was great connecting with {{company}} at the career fair. Thanks for taking the time to chat about our students and what your team is looking for this year.

As a next step, I'd love to share how {{org_name}} partners with companies like yours through sponsorship - from recruiting access to event branding and our hackathon. Based on our conversation, I think the {{tier_name}} tier could be a strong fit.

Would you have 20 minutes in the coming weeks to talk it through?

Best,
${signature}`,
      },
      {
        name: "Renewal ask",
        scenario: "renewal",
        subject: "Renewing our partnership - {{org_name}} x {{company}} for 2026-27",
        body: `Hi {{contact_first_name}},

Thank you again for {{company}}'s support of {{org_name}} - it genuinely made a difference for our {{member_count}} this past year.

As we plan for 2026-27, I'd love to talk about renewing our partnership and, if it's a fit, growing it. I've refreshed our packet and think the {{tier_name}} tier ({{tier_price}}) lines up well with where {{company}} is headed, especially heading into {{anchor_event}}. There are also a few new a la carte options I'd be glad to walk you through.

Could we find some time in the next couple of weeks to reconnect?

With appreciation,
${signature}`,
      },
      {
        name: "Value-add nudge",
        scenario: "value-add",
        subject: "A quick idea for {{company}} + {{org_name}}",
        body: `Hi {{contact_first_name}},

I'll keep this short. Beyond the standard {{tier_name}} benefits, one thing partners tell us moves the needle is early access to our members - a targeted resume cut, a dedicated info session before the recruiting rush, or naming a hackathon track.

If any of those would be useful to {{company}}'s team this year, I'm happy to put together a quick plan tailored to your goals. No pressure either way.

Best,
${signature}`,
      },
      {
        name: "Permission to close",
        scenario: "permission-close",
        subject: "Should I close the loop on {{org_name}} x {{company}}?",
        body: `Hi {{contact_first_name}},

I don't want to keep landing in your inbox if the timing isn't right. Totally understand if sponsorship isn't a fit for {{company}} this cycle.

Would it be alright if I checked back closer to your next budgeting window instead? And if you'd rather I reach out to someone else on your team, just point me their way.

Thanks either way, and I appreciate your time.

Best,
${signature}`,
      },
  ]);

  // -----------------------------------------------------------------------
  // Default cold outreach cadence
  // -----------------------------------------------------------------------
  const allTemplates = await db.select().from(templates);
  const templateByName = (name: string) =>
    allTemplates.find((t) => t.name === name)?.id ?? null;

  const [defaultCadence] = await db
    .insert(cadences)
    .values({
      name: "Default cold outreach",
      description:
        "Benchmark 0/3/7/7 cold sequence: intro (day 0), follow-up (day 3), value-add nudge (day 10), permission-to-close (day 17). Tight early spacing captures the bulk of replies before the low-yield tail.",
    })
    .returning();

  // waitDays are gaps between steps, so cumulative send days are 0, 3, 10, 17.
  // Every step carries a template so a send is always one click away.
  await db.insert(cadenceSteps).values([
    {
      cadenceId: defaultCadence.id,
      position: 1,
      waitDays: 0,
      channel: "email",
      templateId: templateByName("Cold intro"),
      note: "Day 0: send the cold intro email.",
    },
    {
      cadenceId: defaultCadence.id,
      position: 2,
      waitDays: 3,
      channel: "email",
      templateId: templateByName("Follow-up (no reply)"),
      note: "Day 3: follow up if no reply.",
    },
    {
      cadenceId: defaultCadence.id,
      position: 3,
      waitDays: 7,
      channel: "email",
      templateId: templateByName("Value-add nudge"),
      note: "Day 10: value-add nudge with a concrete idea.",
    },
    {
      cadenceId: defaultCadence.id,
      position: 4,
      waitDays: 7,
      channel: "email",
      templateId: templateByName("Permission to close"),
      note: "Day 17: permission-to-close before marking dormant.",
    },
  ]);

  // LinkedIn outreach cadence (triage "Keep + DM'd" / M key). Step 1 is the
  // intro DM already sent at assign-time; the engine starts at step 2 (+6d bump).
  const [linkedinCadence] = await db
    .insert(cadences)
    .values({
      name: "LinkedIn outreach",
      description:
        "Cold LinkedIn DM sequence: intro DM (step 1, logged by triage's Keep + DM'd), one bump ~a week later (connection acceptance lags), then switch to email rather than sending a third DM.",
    })
    .returning();
  await db.insert(cadenceSteps).values([
    {
      cadenceId: linkedinCadence.id,
      position: 1,
      waitDays: 0,
      channel: "linkedin",
      note: "intro DM",
    },
    {
      cadenceId: linkedinCadence.id,
      position: 2,
      waitDays: 6,
      channel: "linkedin",
      note: "one polite bump / check connection accepted",
    },
    {
      cadenceId: linkedinCadence.id,
      position: 3,
      waitDays: 7,
      channel: "email",
      note: "switch channels: email referencing the DM",
    },
    {
      cadenceId: linkedinCadence.id,
      position: 4,
      waitDays: 8,
      channel: "email",
      note: "final follow-up",
    },
  ]);

  // Deliverable templates for the freshly created active tiers.
  await seedDeliverableTemplates();

  console.log("Seed complete.");
  console.log(`  Companies: ${(await db.select().from(companies)).length}`);
  console.log(`  Deals: ${(await db.select().from(deals)).length}`);
  console.log(`  Tiers: ${(await db.select().from(tiers)).length}`);
  console.log(`  Templates: ${(await db.select().from(templates)).length}`);
}

main();
