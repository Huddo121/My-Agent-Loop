import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Logger } from "../logger/Logger";
import type { Database } from "./index";

// The migrator executes the committed SQL files; it does not import the schema.
// In the built artifact the `drizzle/` tree is copied next to the bundled
// entrypoint (dist/index.js + dist/drizzle, see build.mjs). When run from source
// via tsx this module lives at apps/server/src/db, so the committed tree is two
// levels up at apps/server/drizzle. Resolve whichever exists.
export function resolveMigrationsFolder(): string {
  const folder = [
    new URL("./drizzle", import.meta.url),
    new URL("../../drizzle", import.meta.url),
  ]
    .map((url) => fileURLToPath(url))
    .find((candidate) => existsSync(candidate));

  if (!folder) {
    throw new Error("Could not locate the committed migrations folder.");
  }
  return folder;
}

// Applies the committed forward-only migrations against the live database. The
// server calls this on boot, before it serves any traffic, so a request never
// reaches an unmigrated schema and no operator step is required. It is
// idempotent: Drizzle skips migrations already recorded in `__drizzle_migrations`,
// so a restart re-runs this harmlessly. It throws on failure; the caller aborts
// startup so the rollout's healthcheck never goes green against a half-migrated
// database.
export async function runMigrations(
  db: Database,
  logger: Logger,
): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();
  await migrate(db, { migrationsFolder });
  logger.info("Applied database migrations.", { migrationsFolder });
}
