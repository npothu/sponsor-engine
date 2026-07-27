import { describe, expect, it } from "vitest";
import {
  contactInboxDedupeKey,
  normalizeLinkedinUrl,
  normalizeRejectReason,
  parseScrapePayload,
  suggestTriage,
} from "./contact-inbox";

describe("parseScrapePayload()", () => {
  it("parses the full extension result object", () => {
    const parsed = parseScrapePayload(
      JSON.stringify({
        scrapedAt: "2026-07-26T16:08:09.477Z",
        source: "apollo.io people search (screen scrape)",
        count: 2,
        people: [
          {
            name: "Rachel Groenewald",
            title: "Talent Sourcing Specialist",
            company: "The Home Depot",
            linkedin: "http://www.linkedin.com/in/rachel-groenewald",
          },
          { name: "Jordan Foster", title: "Intern", company: "IBM", linkedin: null },
        ],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.people).toHaveLength(2);
    expect(parsed!.scrapedAt).toBe("2026-07-26T16:08:09.477Z");
    expect(parsed!.people[0]).toEqual({
      name: "Rachel Groenewald",
      title: "Talent Sourcing Specialist",
      company: "The Home Depot",
      linkedin: "http://www.linkedin.com/in/rachel-groenewald",
      apolloId: null,
    });
  });

  it("accepts a bare array of people", () => {
    const parsed = parseScrapePayload(
      JSON.stringify([{ name: "A", company: "B" }]),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.people).toHaveLength(1);
    expect(parsed!.source).toBe("apollo");
  });

  it("counts unparseable entries and rejects nameless payloads", () => {
    const parsed = parseScrapePayload(
      JSON.stringify({ people: [{ name: "A" }, { title: "no name" }, 42] }),
    );
    expect(parsed!.people).toHaveLength(1);
    expect(parsed!.skipped).toBe(2);

    expect(parseScrapePayload("not json")).toBeNull();
    expect(parseScrapePayload('{"people": []}')).toBeNull();
    expect(parseScrapePayload('{"nope": true}')).toBeNull();
  });
});

describe("normalizeLinkedinUrl()", () => {
  it("strips protocol, www, query, and trailing slash", () => {
    expect(
      normalizeLinkedinUrl("http://www.linkedin.com/in/Rachel-Groenewald/?x=1"),
    ).toBe("linkedin.com/in/rachel-groenewald");
    expect(normalizeLinkedinUrl("https://linkedin.com/in/obsmith")).toBe(
      "linkedin.com/in/obsmith",
    );
  });

  it("returns null for non-profile URLs", () => {
    expect(normalizeLinkedinUrl("https://linkedin.com/company/ibm")).toBeNull();
    expect(normalizeLinkedinUrl("https://example.com/in/nope")).toBeNull();
    expect(normalizeLinkedinUrl(null)).toBeNull();
  });
});

describe("contactInboxDedupeKey()", () => {
  it("prefers the normalized LinkedIn URL", () => {
    expect(
      contactInboxDedupeKey({
        name: "Rachel",
        company: "Home Depot",
        linkedin: "http://www.linkedin.com/in/rachel-groenewald",
      }),
    ).toBe("linkedin.com/in/rachel-groenewald");
  });

  it("falls back to name|company lowercased", () => {
    expect(
      contactInboxDedupeKey({ name: "Jordan Foster", company: "IBM", linkedin: null }),
    ).toBe("jordan foster|ibm");
  });
});

describe("suggestTriage()", () => {
  it("suggests reject for interns and students", () => {
    expect(suggestTriage("Futureforce Intern")?.suggestion).toBe("reject");
    expect(suggestTriage("Incoming Intern")?.suggestion).toBe("reject");
    expect(suggestTriage("Graduate")?.suggestion).toBe("reject");
  });

  it("suggests keep for campus-facing titles", () => {
    expect(suggestTriage("University Recruiter")?.suggestion).toBe("keep");
    expect(suggestTriage("Campus Recruiting Consultant")?.suggestion).toBe("keep");
    expect(suggestTriage("Early Careers Operations Specialist")?.suggestion).toBe(
      "keep",
    );
  });

  it("lets reject win when a title matches both", () => {
    expect(suggestTriage("University Recruiting Intern")?.suggestion).toBe(
      "reject",
    );
  });

  it("stays silent on undecidable titles", () => {
    expect(suggestTriage("Talent Sourcing Specialist")).toBeNull();
    expect(suggestTriage(null)).toBeNull();
  });
});

describe("normalizeRejectReason()", () => {
  it("passes known reasons through and defaults unknown to other", () => {
    expect(normalizeRejectReason("remote_only")).toBe("remote_only");
    expect(normalizeRejectReason("banana")).toBe("other");
    expect(normalizeRejectReason(undefined)).toBe("other");
  });
});
