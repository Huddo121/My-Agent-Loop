import { existsSync } from "node:fs";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the base dev env, then the Portless wrapper's per-worktree overrides
// when present, so `drizzle-kit` targets the same database the dev server is
// using — in isolated mode that is the worktree's standalone Postgres.
config({ path: ".env.local" });
if (existsSync(".env.portless.local")) {
  config({ path: ".env.portless.local", override: true });
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: This exists outside of the normal codebase, and should explode at runtime without the value
    url: process.env.DATABASE_URL!,
  },
});
