import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

let tempDir: string;
let data: typeof import("./data");
let database: typeof import("./db");
let schema: typeof import("./schema");

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sponsor-triage-linkedin-"));
  process.env.turso_url = `file:${path.join(tempDir, "test.db")}`;
  data = await import("./data");
  database = await import("./db");
  schema = await import("./schema");
  await database.ensureMigrated();
});

afterAll(() => {
  delete process.env.turso_url;
  database.client.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    // libSQL can retain a Windows file handle briefly after close.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
});

describe("triage LinkedIn outreach", () => {
  it("does not advance an existing email cadence for a LinkedIn touch", async () => {
    const company = await data.createCompany({ name: "Email Cadence Co" });
    const cadence = await data.createCadence({ name: "Email only" });
    await data.setCadenceSteps(cadence.id, [
      { position: 1, waitDays: 0, channel: "email", note: "intro" },
      { position: 2, waitDays: 3, channel: "email", note: "follow-up" },
    ]);
    const deal = await data.createDeal({
      companyId: company.id,
      cycle: await data.getCurrentCycle(),
      cadenceId: cadence.id,
      cadenceStepIndex: 0,
    });
    await data.ingestContactInbox([
      {
        name: "Email Cadence Contact",
        title: "Campus Recruiter",
        company: company.name,
        linkedin: "https://linkedin.com/in/email-cadence-contact",
        apolloId: null,
      },
    ]);
    const inbox = (await data.listContactInbox("pending")).at(-1)!;

    const result = await data.keepAndMessageInboxContact(inbox.id);
    expect(result).not.toBeNull();

    const updatedDeal = await database.db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, deal.id))
      .get();
    expect(updatedDeal?.cadenceId).toBe(cadence.id);
    expect(updatedDeal?.cadenceStepIndex).toBe(0);

    const cadenceActions = await database.db
      .select()
      .from(schema.nextActions)
      .where(
        and(
          eq(schema.nextActions.dealId, deal.id),
          eq(schema.nextActions.createdBy, "cadence"),
        ),
      )
      .all();
    expect(cadenceActions).toHaveLength(0);
  });

  it("restores a pre-assigned LinkedIn cadence cursor on undo", async () => {
    const cadence = await database.db
      .select()
      .from(schema.cadences)
      .where(eq(schema.cadences.name, data.LINKEDIN_CADENCE_NAME))
      .get();
    const company = await data.createCompany({ name: "Preassigned LinkedIn Co" });
    const deal = await data.createDeal({
      companyId: company.id,
      cycle: await data.getCurrentCycle(),
      cadenceId: cadence!.id,
      cadenceStepIndex: 0,
    });
    await data.ingestContactInbox([
      {
        name: "Preassigned LinkedIn Contact",
        title: "Campus Recruiter",
        company: company.name,
        linkedin: "https://linkedin.com/in/preassigned-linkedin",
        apolloId: null,
      },
    ]);
    const inbox = (await data.listContactInbox("pending")).at(-1)!;

    await data.keepAndMessageInboxContact(inbox.id);
    const advanced = await database.db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, deal.id))
      .get();
    expect(advanced?.cadenceId).toBe(cadence!.id);
    expect(advanced?.cadenceStepIndex).toBe(2);

    await data.undoTriageLinkedinTouch(inbox.id);
    const restored = await database.db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, deal.id))
      .get();
    expect(restored?.cadenceId).toBe(cadence!.id);
    expect(restored?.cadenceStepIndex).toBe(0);
  });

  it("rolls back every write when the atomic decision fails", async () => {
    await data.ingestContactInbox([
      {
        name: "Atomic Contact",
        title: "University Recruiter",
        company: "Atomic Co",
        linkedin: "https://linkedin.com/in/atomic-contact",
        apolloId: null,
      },
    ]);
    const inbox = (await data.listContactInbox("pending")).at(-1)!;

    await expect(
      data.keepAndMessageInboxContact(inbox.id, 999_999),
    ).rejects.toThrow();

    const stillPending = await database.db
      .select()
      .from(schema.contactInbox)
      .where(eq(schema.contactInbox.id, inbox.id))
      .get();
    expect(stillPending?.status).toBe("pending");
    expect(stillPending?.companyId).toBeNull();
    const rolledBackCompany = await database.db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.name, "Atomic Co"))
      .get();
    expect(rolledBackCompany).toBeUndefined();

    const result = await data.keepAndMessageInboxContact(inbox.id);
    expect(result).not.toBeNull();
    const kept = await database.db
      .select()
      .from(schema.contactInbox)
      .where(eq(schema.contactInbox.id, inbox.id))
      .get();
    expect(kept?.decisionKind).toBe("linkedin");
    expect(kept?.triageTouchpointId).not.toBeNull();

    const touches = await database.db
      .select()
      .from(schema.touchpoints)
      .where(eq(schema.touchpoints.contactId, kept!.contactId!))
      .all();
    expect(touches).toHaveLength(1);
  });

  it("edits and safely undoes the triage-created touch", async () => {
    const inbox = (await data.listContactInbox("kept")).find(
      (row) => row.name === "Atomic Contact",
    )!;

    const edited = await data.updateTriageLinkedinTouch(
      inbox.id,
      "connection_request",
      "Mentioned the fall career fair",
    );
    expect(edited?.linkedinTouchType).toBe("connection_request");
    expect(edited?.linkedinNote).toBe("Mentioned the fall career fair");

    const touch = await database.db
      .select()
      .from(schema.touchpoints)
      .where(eq(schema.touchpoints.id, edited!.triageTouchpointId!))
      .get();
    expect(touch?.summary).toContain("connection request");
    expect(touch?.summary).toContain("fall career fair");

    const undone = await data.undoTriageLinkedinTouch(inbox.id);
    expect(undone?.status).toBe("kept");
    expect(undone?.decisionKind).toBe("keep");
    expect(undone?.triageTouchpointId).toBeNull();

    const removedTouch = await database.db
      .select()
      .from(schema.touchpoints)
      .where(eq(schema.touchpoints.id, touch!.id))
      .get();
    expect(removedTouch).toBeUndefined();

    const restoredDeal = await database.db
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, inbox.triageDealId!))
      .get();
    expect(restoredDeal?.stage).toBe("prospect");
    expect(restoredDeal?.cadenceId).toBeNull();
  });
});
