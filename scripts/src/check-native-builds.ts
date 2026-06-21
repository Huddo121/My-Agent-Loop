import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// pnpm refuses to run a dependency's install scripts unless that dependency is
// explicitly allow-listed, which keeps an arbitrary `postinstall` in the tree
// from executing on `pnpm install`. This guard makes that decision auditable:
// every dependency that *has* a build script must be consciously classified as
// either run (`onlyBuiltDependencies`) or acknowledged-and-skipped
// (`ignoredBuiltDependencies`). A newly introduced native build then fails CI
// until a human triages it, rather than being silently ignored.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKSPACE = join(ROOT, "pnpm-workspace.yaml");
const PNPM_STORE = join(ROOT, "node_modules/.pnpm");

// The lifecycle scripts pnpm gates behind the build allow-list.
const BUILD_SCRIPTS = ["preinstall", "install", "postinstall"] as const;

type Workspace = {
  onlyBuiltDependencies?: string[];
  ignoredBuiltDependencies?: string[];
};

/**
 * Recover a package name from a pnpm virtual-store directory name, e.g.
 * `esbuild@0.25.0` -> `esbuild`, `@scope+pkg@1.0.0(peer@2)` -> `@scope/pkg`.
 */
function packageNameFromStoreDir(entry: string): string {
  const withoutPeers = entry.split("(")[0];
  if (withoutPeers.startsWith("@")) {
    const [scopeAndName] = withoutPeers.slice(1).split("@");
    return `@${scopeAndName.replace("+", "/")}`;
  }
  return withoutPeers.split("@")[0];
}

/** Every installed dependency that declares a gated build script. */
function findDependenciesWithBuildScripts(): Set<string> {
  const found = new Set<string>();
  if (!existsSync(PNPM_STORE)) {
    throw new Error(
      `Expected pnpm store at ${PNPM_STORE}. Run 'pnpm install' first.`,
    );
  }

  for (const entry of readdirSync(PNPM_STORE)) {
    // The store also holds a shared `node_modules` dir and a `lock.yaml`.
    if (entry === "node_modules" || entry.endsWith(".yaml")) continue;

    const name = packageNameFromStoreDir(entry);
    const manifestPath = join(
      PNPM_STORE,
      entry,
      "node_modules",
      name,
      "package.json",
    );
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const scripts: Record<string, unknown> = manifest.scripts ?? {};
      if (BUILD_SCRIPTS.some((script) => typeof scripts[script] === "string")) {
        found.add(name);
      }
    } catch {
      // A malformed manifest in the store is not this guard's concern.
    }
  }

  return found;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function main(): void {
  const workspace = parse(readFileSync(WORKSPACE, "utf8")) as Workspace;
  const approved = new Set(workspace.onlyBuiltDependencies ?? []);
  const ignored = new Set(workspace.ignoredBuiltDependencies ?? []);
  const classified = new Set([...approved, ...ignored]);

  const universe = findDependenciesWithBuildScripts();

  const unclassified = sorted(
    [...universe].filter((name) => !classified.has(name)),
  );
  const stale = sorted([...classified].filter((name) => !universe.has(name)));

  if (unclassified.length === 0 && stale.length === 0) {
    console.log(
      `Native-build allow-list is in sync (${universe.size} dependencies with build scripts, all classified).`,
    );
    return;
  }

  console.error(
    "Native-build allow-list is out of sync with installed dependencies.\n",
  );

  if (unclassified.length > 0) {
    console.error(
      "Dependencies with build scripts that are not yet classified:",
    );
    for (const name of unclassified) console.error(`  - ${name}`);
    console.error(
      "\nFor each, edit pnpm-workspace.yaml and add it to either:" +
        "\n  - onlyBuiltDependencies   (you reviewed it and want pnpm to run its build), or" +
        "\n  - ignoredBuiltDependencies (you reviewed it and want pnpm to skip its build).\n",
    );
  }

  if (stale.length > 0) {
    console.error(
      "Allow-list entries that no longer have a build script (remove them):",
    );
    for (const name of stale) console.error(`  - ${name}`);
    console.error("");
  }

  console.error(
    "Never add an unreviewed dependency to onlyBuiltDependencies to silence this check. " +
      "See the tooling-and-ci skill for the reasoning behind this guard.",
  );
  process.exit(1);
}

main();
