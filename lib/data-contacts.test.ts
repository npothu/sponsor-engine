import { beforeAll, describe, expect, it, vi } from "vitest";

// lib/data.ts talks to the singleton in lib/db.ts, which would otherwise open
// the developer's real data/sponsortrack.db. Swap it for a throwaway libSQL
// database running the same migrations - foreign keys included, since FK
// enforcement is exactly what these tests are about. It has to be a temp FILE,
// not ":memory:": libSQL gives each connection its own memory database, so the
// separate connection client.transaction() opens would see an empty schema.
vi.mock("./db", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("./schema");
  const { migrate } = await import("./migrate");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sponsor-engine-test-"));
  const client = createClient({ url: `file:${path.join(dir, "test.db")}` });
  const db = drizzle(client, { schema });
  let migrated: Promise<void> | undefined;
  return {
    db,
    client,
    schema,
    ensureMigrated: () => (migrated ??= migrate(client)),
  };
});

import { normalizeCompanyName } from "@/app/prospects/dedupe";
import { client, ensureMigrated } from "./db";
import {
  companyIdsWithOutboundTouch,
  contactCountByCompany,
  deleteContact,
  keepInboxContact,
  undoKeepInboxContact,
} from "./data";

beforeAll(async () => {
  await ensureMigrated();
  await client.executeMultiple(`
    INSERT INTO companies (id, name) VALUES (1, 'Acme'), (2, 'Globex'), (3, 'Initech');
    INSERT INTO contacts (id, company_id, name) VALUES
      (10, 1, 'Andrew'), (11, 1, 'Bea'), (12, 2, 'Cass');
    UPDATE contacts SET referred_by_contact_id = 10 WHERE id = 11;
    INSERT INTO deals (id, company_id, cycle, champion_contact_id)
      VALUES (100, 1, '2026', 10);
    INSERT INTO touchpoints (company_id, contact_id, direction, occurred_at)
      VALUES (1, 10, 'outbound', '2026-07-01');
    INSERT INTO touchpoints (company_id, contact_id, direction, occurred_at)
      VALUES (2, 12, 'inbound', '2026-07-02');
    INSERT INTO contact_inbox (dedupe_key, name, contact_id, status)
      VALUES ('andrew|acme', 'Andrew', 10, 'kept');

    -- Pending rows for the keep/undo-keep round trip. Dana is new to Initech;
    -- Cass already exists on Globex, so keeping her reuses that contact.
    INSERT INTO contact_inbox (id, dedupe_key, name, title, company_name, status)
      VALUES (500, 'dana|initech', 'Dana', 'University Recruiter', 'Initech', 'pending'),
             (501, 'cass|globex', 'Cass', 'Engineer', 'Globex', 'pending');
  `);
  // keepInboxContact matches companies on the normalized-name column.
  for (const [id, name] of [
    [1, "Acme"],
    [2, "Globex"],
    [3, "Initech"],
  ] as const) {
    await client.execute({
      sql: "UPDATE companies SET normalized_name = ? WHERE id = ?",
      args: [normalizeCompanyName(name), id],
    });
  }
});

describe("contactCountByCompany()", () => {
  it("counts contacts per company and omits companies with none", async () => {
    const counts = await contactCountByCompany();
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.has(3)).toBe(false);
  });
});

describe("companyIdsWithOutboundTouch()", () => {
  it("includes outbound-touched companies only", async () => {
    const ids = await companyIdsWithOutboundTouch();
    expect(ids.has(1)).toBe(true);
    // Globex only ever contacted us, so we have not reached out yet.
    expect(ids.has(2)).toBe(false);
    expect(ids.has(3)).toBe(false);
  });
});

describe("undoKeepInboxContact()", () => {
  it("returns the row to pending and removes the contact keep created", async () => {
    const kept = await keepInboxContact(500);
    expect(kept?.reusedContact).toBe(false);
    const contactId = kept!.contactId;

    const undone = await undoKeepInboxContact(500);
    expect(undone?.removedContact).toBe(true);
    expect(undone?.keptContactBecause).toBe(null);
    expect(undone?.row.status).toBe("pending");
    expect(undone?.row.contactId).toBe(null);
    expect(undone?.row.companyId).toBe(null);
    expect(undone?.row.decidedAt).toBe(null);

    const contact = await client.execute({
      sql: "SELECT id FROM contacts WHERE id = ?",
      args: [contactId],
    });
    expect(contact.rows).toHaveLength(0);
  });

  it("leaves a contact the keep only matched", async () => {
    const kept = await keepInboxContact(501);
    expect(kept?.reusedContact).toBe(true);
    expect(kept?.contactId).toBe(12);

    const undone = await undoKeepInboxContact(501);
    expect(undone?.removedContact).toBe(false);
    expect(undone?.keptContactBecause).toBe("reused");
    expect(undone?.row.status).toBe("pending");

    const contact = await client.execute("SELECT id FROM contacts WHERE id = 12");
    expect(contact.rows).toHaveLength(1);
  });

  it("refuses rows that are not kept", async () => {
    expect(await undoKeepInboxContact(500)).toBe(null);
  });
});

describe("deleteContact()", () => {
  it("deletes a referenced contact and detaches its history", async () => {
    await deleteContact(10);

    const gone = await client.execute("SELECT id FROM contacts WHERE id = 10");
    expect(gone.rows).toHaveLength(0);

    // The touchpoint survives on the company, just unlinked from the person.
    const touch = await client.execute(
      "SELECT contact_id FROM touchpoints WHERE company_id = 1",
    );
    expect(touch.rows).toHaveLength(1);
    expect(touch.rows[0]!.contact_id).toBe(null);

    // The triage decision survives too.
    const inbox = await client.execute(
      "SELECT status, contact_id FROM contact_inbox WHERE dedupe_key = 'andrew|acme'",
    );
    expect(inbox.rows[0]!.status).toBe("kept");
    expect(inbox.rows[0]!.contact_id).toBe(null);

    // No dangling referral or champion pointers left behind.
    const referral = await client.execute(
      "SELECT referred_by_contact_id FROM contacts WHERE id = 11",
    );
    expect(referral.rows[0]!.referred_by_contact_id).toBe(null);
    const champion = await client.execute(
      "SELECT champion_contact_id FROM deals WHERE id = 100",
    );
    expect(champion.rows[0]!.champion_contact_id).toBe(null);
  });
});
