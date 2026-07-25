import type { Config } from "drizzle-kit";

export default {
  dialect: "turso",
  schema: "./lib/schema.ts",
  dbCredentials: {
    url: process.env.turso_url!,
    authToken: process.env.turso_auth_token,
  },
} satisfies Config;
