import type { ContactInboxRejectReason } from "./schema";

/**
 * Pure helpers for the contact-inbox triage flow: parsing pasted Apollo scrape
 * JSON, normalizing LinkedIn URLs into dedupe keys, and suggesting a
 * keep/reject decision from the job title. No database or server dependencies
 * so both the client (badges) and the data layer (ingest) can share them.
 */

/** One person from an Apollo scrape payload, normalized. */
export interface ScrapedPerson {
  name: string;
  title: string | null;
  company: string | null;
  linkedin: string | null;
  apolloId: string | null;
}

/** A parsed paste: the people plus scrape metadata when present. */
export interface ParsedScrape {
  people: ScrapedPerson[];
  scrapedAt: string | null;
  source: string;
  /** lines/entries that could not be parsed into a person */
  skipped: number;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function toPerson(raw: unknown): ScrapedPerson | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const name = asString(o.name);
  if (!name) return null;
  return {
    name,
    title: asString(o.title),
    company: asString(o.company),
    linkedin: asString(o.linkedin),
    apolloId: asString(o.apolloId),
  };
}

/**
 * Parse pasted scrape JSON. Accepts either the full extension result object
 * ({ scrapedAt, people: [...] }) or a bare array of people. Returns null when
 * the text is not JSON or contains no usable people.
 */
export function parseScrapePayload(raw: string): ParsedScrape | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const obj =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  const list = Array.isArray(data) ? data : obj?.people;
  if (!Array.isArray(list)) return null;

  const people: ScrapedPerson[] = [];
  let skipped = 0;
  for (const entry of list) {
    const person = toPerson(entry);
    if (person) people.push(person);
    else skipped += 1;
  }
  if (!people.length) return null;

  return {
    people,
    scrapedAt: obj ? asString(obj.scrapedAt) : null,
    source: (obj && asString(obj.source)) ?? "apollo",
    skipped,
  };
}

/**
 * Normalize a LinkedIn profile URL to a stable dedupe form:
 * "linkedin.com/in/<slug>" - lowercased, protocol/www/query/trailing-slash
 * stripped. Returns null for anything that is not an /in/ profile URL.
 */
export function normalizeLinkedinUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleaned = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
  const match = cleaned.match(/linkedin\.com\/in\/[^/]+/);
  return match ? match[0] : null;
}

/**
 * Natural dedupe key for an inbox row: the normalized LinkedIn URL when the
 * scrape captured one, else "name|company" lowercased. Re-pasting an
 * overlapping scrape collides on this key and is ignored.
 */
export function contactInboxDedupeKey(person: {
  name: string;
  company: string | null;
  linkedin: string | null;
}): string {
  return (
    normalizeLinkedinUrl(person.linkedin) ??
    `${person.name}|${person.company ?? ""}`.toLowerCase()
  );
}

/** A title-based triage hint shown as a badge; never decides on its own. */
export interface TriageSuggestion {
  suggestion: "keep" | "reject";
  reason: string;
}

const REJECT_TITLE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bintern(ship)?\b/i, "intern"],
  [/\bincoming\b/i, "incoming hire"],
  [/\bco[- ]?op\b/i, "co-op"],
  [/\bstudent\b/i, "student"],
  [/\bnew grad(uate)?\b|\bgraduate\b/i, "new grad"],
];

const KEEP_TITLE_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/university|campus|college/i, "campus-facing"],
  [/early career/i, "early careers"],
  [/emerging talent/i, "emerging talent"],
  [/community engagement|social impact|dei\b|diversity/i, "community/DEI"],
];

/**
 * Suggest keep/reject from the job title alone. Reject patterns win over keep
 * patterns so "University Recruiting Intern" reads as an intern, not a
 * recruiter. Returns null when the title says nothing decisive either way.
 */
export function suggestTriage(title: string | null): TriageSuggestion | null {
  if (!title) return null;
  for (const [re, reason] of REJECT_TITLE_PATTERNS) {
    if (re.test(title)) return { suggestion: "reject", reason };
  }
  for (const [re, reason] of KEEP_TITLE_PATTERNS) {
    if (re.test(title)) return { suggestion: "keep", reason };
  }
  return null;
}

/** Reject reasons offered in the triage UI, in display order. */
export const REJECT_REASONS: ReadonlyArray<{
  key: ContactInboxRejectReason;
  label: string;
}> = [
  { key: "intern", label: "Intern / student" },
  { key: "no_campus_presence", label: "No campus presence" },
  { key: "remote_only", label: "Remote only" },
  { key: "wrong_location", label: "Wrong location" },
  { key: "duplicate", label: "Duplicate" },
  { key: "other", label: "Other" },
] as const;

const REJECT_REASON_KEYS = new Set<string>(REJECT_REASONS.map((r) => r.key));

/** Coerce arbitrary input to a known reject reason, defaulting to 'other'. */
export function normalizeRejectReason(v: unknown): ContactInboxRejectReason {
  return typeof v === "string" && REJECT_REASON_KEYS.has(v)
    ? (v as ContactInboxRejectReason)
    : "other";
}
