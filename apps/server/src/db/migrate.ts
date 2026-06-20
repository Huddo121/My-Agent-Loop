import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Standalone migration entrypoint. This deliberately does NOT import `../env`:
// the full server env schema requires a dozen runtime secrets that the one-shot
// migrate container has no business holding. A migration needs exactly one
// thing — where the database is — so we read that single variable here at the
// process boundary and fail loudly if it is missing.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Migration aborted: DATABASE_URL is not set.");
  process.exit(1);
}

// The migrator executes the committed SQL files; it does not import the schema.
// In the built artifact `drizzle/` sits next to this file (dist/migrate.js +
// dist/drizzle, see build.mjs). When run from source via tsx it lives two
// levels up at apps/server/drizzle, so we resolve whichever exists.
const migrationsFolder = [
  new URL("./drizzle", import.meta.url),
  new URL("../../drizzle", import.meta.url),
]
  .map((url) => fileURLToPath(url))
  .find((candidate) => existsSync(candidate));

if (!migrationsFolder) {
  console.error("Migration aborted: could not locate the migrations folder.");
  process.exit(1);
}

const db = drizzle(databaseUrl);

try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully.");
} catch (error) {
  console.error("Migration failed.", error);
  process.exitCode = 1;
} finally {
  // drizzle() created an internal pg Pool from the connection string; close it
  // so the process can exit instead of hanging on an open connection.
  await db.$client.end();
}
