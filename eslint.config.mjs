import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees live under .claude/worktrees/. Linting them re-reports every
    // stale branch's problems against this checkout, which buried the handful of
    // real findings under thousands of duplicates.
    ".claude/**",
  ]),
]);

export default eslintConfig;
