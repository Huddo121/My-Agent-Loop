import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMigrationsFolder } from "./run-migrations";

// The server applies migrations on boot by reading the committed drizzle/ tree
// relative to this module. That resolution is invisible to the type checker, so
// it would break silently if the migrations moved or build.mjs stopped copying
// them next to the bundled entrypoint. Pin that the folder is locatable and is a
// real Drizzle migrations directory (it has the journal the runtime migrator
// reads), so such a regression fails here rather than at production boot.
describe("resolveMigrationsFolder", () => {
  it("locates the committed Drizzle migrations directory", () => {
    const folder = resolveMigrationsFolder();

    expect(existsSync(folder)).toBe(true);
    expect(existsSync(path.join(folder, "meta", "_journal.json"))).toBe(true);
  });
});
