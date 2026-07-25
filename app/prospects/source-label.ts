import type { SourceDef } from "./sources";

/**
 * Client-safe source-label lookup. The `sources` module is server-only, so
 * client components receive the catalog as a prop and resolve labels through
 * this pure helper instead of importing the server module.
 */
export function sourceLabelClient(
  sources: readonly SourceDef[],
  key: string | null | undefined,
): string {
  if (!key) return "No source";
  return sources.find((s) => s.key === key)?.label ?? key;
}
