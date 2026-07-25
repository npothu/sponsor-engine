import { describe, expect, it } from "vitest";
import { inferContactCategory, inferEmailStatus } from "./contact-backfill";

describe("inferContactCategory", () => {
  it("tags campus recruiters as university_relations", () => {
    expect(
      inferContactCategory({
        id: 1,
        name: "Jane Doe",
        role: "Campus Recruiting Lead",
        email: null,
        contactType: "gatekeeper",
        sourcedFrom: null,
        notes: null,
      }),
    ).toBe("university_relations");
  });

  it("tags ERG chairs as erg_lead", () => {
    expect(
      inferContactCategory({
        id: 1,
        name: "Ann Li",
        role: "Co-Chair, AsPIRE North America",
        email: null,
        contactType: "influencer",
        sourcedFrom: "Asian BRG search 2026-07",
        notes: null,
      }),
    ).toBe("erg_lead");
  });

  it("tags GT alumni as alum_early_career", () => {
    expect(
      inferContactCategory({
        id: 1,
        name: "Chris Wang",
        role: "Software Engineer II",
        email: null,
        contactType: "champion",
        sourcedFrom: null,
        notes: "Alum, class of '19",
      }),
    ).toBe("alum_early_career");
  });

  it("tags group contacts as channel_fallback", () => {
    expect(
      inferContactCategory({
        id: 1,
        name: "Northwind Campus Recruiting (group)",
        role: "Campus Recruiting team inbox",
        email: "campusrecruitment@northwind.example.com",
        contactType: "gatekeeper",
        sourcedFrom: null,
        notes: null,
      }),
    ).toBe("channel_fallback");
  });
});

describe("inferEmailStatus", () => {
  it("tags role inboxes", () => {
    expect(
      inferEmailStatus({
        id: 1,
        name: "Cobalt Candidate Care",
        role: "Students & Early Careers",
        email: "candidatecare@cobaltenergy.example.com",
        contactType: null,
        sourcedFrom: null,
        notes: null,
      }),
    ).toBe("role_inbox");
  });

  it("leaves person emails untagged", () => {
    expect(
      inferEmailStatus({
        id: 1,
        name: "Jordan Reyes",
        role: "University Relations",
        email: "jreyes@meridianlabs.example.com",
        contactType: null,
        sourcedFrom: null,
        notes: null,
      }),
    ).toBeNull();
  });
});
