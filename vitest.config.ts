import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    include: ["**/*.test.ts"],
    // Git worktrees live under .claude/worktrees/. Without this, every worktree's
    // copy of the suite is collected alongside the checkout's own, so stale
    // branches fail the run for reasons that have nothing to do with this code.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
