import { describe, expect, it } from "vitest";
import { normalizeCompanyName, normalizeHost } from "./dedupe";

describe("normalizeHost", () => {
  it("strips www and lowercases", () => {
    expect(normalizeHost("https://WWW.Example.COM/path")).toBe("example.com");
  });

  it("accepts bare domains", () => {
    expect(normalizeHost("initech.com")).toBe("initech.com");
  });

  it("strips scheme, path, query, and port from full URLs", () => {
    expect(normalizeHost("http://acme.co:8080/about?ref=1#team")).toBe(
      "acme.co",
    );
  });

  it("returns null for empty or invalid input", () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost("   ")).toBeNull();
    expect(normalizeHost("not a url!!!")).toBeNull();
  });
});

describe("normalizeCompanyName", () => {
  it("strips Inc/Corp/LLC suffixes", () => {
    expect(normalizeCompanyName("Acme, Inc.")).toBe("acme");
    expect(normalizeCompanyName("Acme Corporation")).toBe("acme");
    expect(normalizeCompanyName("Acme LLC")).toBe("acme");
  });

  it("strips chained corporate suffixes", () => {
    expect(normalizeCompanyName("Foo Tech Holdings")).toBe("foo tech");
    expect(normalizeCompanyName("Acme Technologies Corporation")).toBe("acme");
  });

  it("normalizes punctuation and whitespace", () => {
    expect(normalizeCompanyName("  Acme & Co.,  Ltd.  ")).toBe("acme");
    expect(normalizeCompanyName("O'Reilly-Media")).toBe("oreillymedia");
  });
});
