/**
 * Pure normalization helpers for import de-duplication. Kept dependency-free
 * (no server-only, no db) so the preview action, the commit action, and the
 * query layer can all share exactly one definition of "same company".
 */

/**
 * Reduce a website to its bare host: lowercase, no scheme, no leading "www.",
 * no path/query/port. Returns null when there is nothing host-like to compare.
 * Accepts bare hosts ("initech.com") as well as full URLs.
 */
export function normalizeHost(website: string | null | undefined): string | null {
  if (!website) return null;
  let raw = website.trim().toLowerCase();
  if (!raw) return null;
  // Prepend a scheme so the URL parser can find the host of a bare domain.
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = `http://${raw}`;
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  return host || null;
}

/** Corporate suffixes stripped when comparing company names. */
const NAME_SUFFIXES = [
  "incorporated",
  "corporation",
  "corp",
  "inc",
  "llc",
  "llp",
  "ltd",
  "limited",
  "co",
  "company",
  "plc",
  "gmbh",
  "group",
  "holdings",
  "technologies",
  "technology",
  "labs",
];

/**
 * Normalize a company name for fuzzy matching: lowercase, drop punctuation,
 * collapse whitespace, and strip trailing corporate suffixes (Inc, Corp, LLC,
 * Ltd, Co, ...). "Acme, Inc." and "Acme Corporation" both reduce to "acme".
 */
export function normalizeCompanyName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/[.,&]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip trailing suffix tokens repeatedly ("Foo Tech Holdings" -> "foo tech").
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of NAME_SUFFIXES) {
      if (s === suffix) break;
      if (s.endsWith(` ${suffix}`)) {
        s = s.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s;
}

/** How a candidate import line matched an existing/earlier company. */
export type DedupeMatch =
  | { kind: "none" }
  | { kind: "host"; of: string }
  | { kind: "name"; of: string };
