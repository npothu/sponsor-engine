import { createClient, type Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";

async function tableExists(client: Client, name: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

async function columnExists(
  client: Client,
  table: string,
  column: string,
): Promise<boolean> {
  const cols = await client.execute(`PRAGMA table_info(${table})`);
  return cols.rows.some((c) => (c as unknown as { name: string }).name === column);
}

async function userVersion(client: Client): Promise<number> {
  const result = await client.execute(
    "SELECT version FROM schema_version WHERE id = 1",
  );
  return (
    (result.rows[0] as unknown as { version: number } | undefined)?.version ?? 0
  );
}

describe("migrate()", () => {
  it("applies schema v8+ on a fresh in-memory database", async () => {
    const client = createClient({ url: ":memory:" });
    await migrate(client);

    const version = await userVersion(client);
    expect(version).toBeGreaterThanOrEqual(8);

    expect(await tableExists(client, "companies")).toBe(true);
    expect(await tableExists(client, "contacts")).toBe(true);
    expect(await tableExists(client, "stage_events")).toBe(true);

    if (version >= 9) {
      expect(await tableExists(client, "import_runs")).toBe(true);
      expect(await columnExists(client, "companies", "host")).toBe(true);
      expect(await columnExists(client, "companies", "normalized_name")).toBe(true);
    }
    if (version >= 15) {
      expect(
        await columnExists(client, "contact_inbox", "triage_touchpoint_id"),
      ).toBe(true);
      expect(
        await columnExists(client, "contact_inbox", "linkedin_touch_type"),
      ).toBe(true);
      expect(
        await columnExists(
          client,
          "contact_inbox",
          "triage_previous_cadence_step_index",
        ),
      ).toBe(true);
      expect(await columnExists(client, "contact_inbox", "linkedin_note")).toBe(
        true,
      );
    }

    client.close();
  });

  it("is idempotent when re-run on an already-migrated database", async () => {
    const client = createClient({ url: ":memory:" });
    await migrate(client);
    const versionAfterFirst = await userVersion(client);

    await migrate(client);
    const versionAfterSecond = await userVersion(client);

    expect(versionAfterSecond).toBe(versionAfterFirst);
    client.close();
  });

  it("backfills host for only the lowest-id company when websites share a host", async () => {
    const client = createClient({ url: ":memory:" });
    await migrate(client);

    await client.executeMultiple(`
      DELETE FROM companies;
      DROP INDEX IF EXISTS idx_companies_host;
    `);
    await client.execute({
      sql: "INSERT INTO companies (id, name, type, website, normalized_name, host) VALUES (?, ?, 'corporate', ?, NULL, NULL)",
      args: [1, "Acme A", "https://example.com"],
    });
    await client.execute({
      sql: "INSERT INTO companies (id, name, type, website, normalized_name, host) VALUES (?, ?, 'corporate', ?, NULL, NULL)",
      args: [2, "Acme B", "https://www.example.com"],
    });
    await client.execute({
      sql: `INSERT INTO schema_version (id, version) VALUES (1, 8)
            ON CONFLICT(id) DO UPDATE SET version = excluded.version`,
      args: [],
    });

    await migrate(client);

    const rowsResult = await client.execute(
      "SELECT id, host, normalized_name FROM companies ORDER BY id",
    );
    const rows = rowsResult.rows as unknown as Array<{
      id: number;
      host: string | null;
      normalized_name: string | null;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]!.host).toBe("example.com");
    expect(rows[1]!.host).toBeNull();
    expect(rows[0]!.normalized_name).toBeTruthy();
    expect(rows[1]!.normalized_name).toBeTruthy();

    client.close();
  });

  it("backfills contact category from legacy fields on every migrate", async () => {
    const client = createClient({ url: ":memory:" });
    await migrate(client);

    await client.execute(
      "INSERT INTO companies (id, name, type) VALUES (1, 'Example Co', 'corporate')",
    );
    await client.execute({
      sql: `INSERT INTO contacts (company_id, name, role, email, contact_type, sourced_from, warmth)
            VALUES (1, ?, ?, ?, ?, ?, 'cold')`,
      args: [
        "Campus Recruiting (group)",
        "Early Careers Portal",
        "jobs@example.com",
        "gatekeeper",
        null,
      ],
    });

    await migrate(client);

    const rowResult = await client.execute(
      "SELECT category, email_status FROM contacts WHERE id = 1",
    );
    const row = rowResult.rows[0] as unknown as {
      category: string | null;
      email_status: string | null;
    };

    expect(row.category).toBe("channel_fallback");
    expect(row.email_status).toBe("role_inbox");

    client.close();
  });
});
