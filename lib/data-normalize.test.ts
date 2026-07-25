import { describe, expect, it } from "vitest";
import {
  normalizeCompanyPriority,
  normalizeContactType,
} from "./data";

describe("normalizeCompanyPriority", () => {
  it("passes through valid priorities", () => {
    expect(normalizeCompanyPriority("high")).toBe("high");
    expect(normalizeCompanyPriority("medium")).toBe("medium");
    expect(normalizeCompanyPriority("low")).toBe("low");
  });

  it("defaults invalid values to medium", () => {
    expect(normalizeCompanyPriority(null)).toBe("medium");
    expect(normalizeCompanyPriority(undefined)).toBe("medium");
    expect(normalizeCompanyPriority("urgent")).toBe("medium");
  });
});

describe("normalizeContactType", () => {
  it("passes through valid contact types", () => {
    expect(normalizeContactType("champion")).toBe("champion");
    expect(normalizeContactType("budget_holder")).toBe("budget_holder");
    expect(normalizeContactType("unknown")).toBe("unknown");
  });

  it("defaults invalid values to unknown", () => {
    expect(normalizeContactType(null)).toBe("unknown");
    expect(normalizeContactType(undefined)).toBe("unknown");
    expect(normalizeContactType("ceo")).toBe("unknown");
  });
});
