import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(here, "dist");

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const workspaceSrc = (pkg) =>
  path.resolve(here, "..", "..", "packages", pkg, "src", "index.ts");

// Bundle only the first-party graph (the server plus the @mono/* workspace
// packages, aliased to their TypeScript sources). The source uses extensionless
// imports and bundler-style resolution that Node's ESM loader rejects at
// runtime, so bundling resolves that ahead of time.
//
// Every real dependency stays external (packages: "external") and is installed
// in node_modules by `pnpm deploy`. Bundling them too is not viable: dockerode
// pulls in native .node addons (ssh2, cpu-features) and some validation
// libraries dynamically import optional packages that aren't installed.
await esbuild.build({
  // Two entrypoints: the server (index.js) and the standalone one-shot DB
  // migrator (migrate.js). The migrate container reuses this same image and
  // runs `node dist/migrate.js`, so the migrator must be bundled here too.
  entryPoints: {
    index: path.join(here, "src", "index.ts"),
    migrate: path.join(here, "src", "db", "migrate.ts"),
  },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outdir,
  packages: "external",
  alias: {
    "@mono/api": workspaceSrc("api"),
    "@mono/driver-api": workspaceSrc("driver-api"),
  },
  // Some externalised CommonJS dependencies reach for `require` once imported;
  // provide one derived from this module's URL.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: false,
  minify: false,
});

// lifecycle.sh is read at runtime relative to this bundle (import.meta.url), so
// it must sit next to the emitted index.js rather than under dist/sandbox/.
fs.copyFileSync(
  path.join(here, "src", "sandbox", "lifecycle.sh"),
  path.join(outdir, "lifecycle.sh"),
);

// The committed SQL migrations are read at runtime by dist/migrate.js relative
// to its own URL, so copy the whole drizzle/ tree (SQL + meta) next to it. This
// keeps raw TypeScript and the drizzle-kit CLI out of the production image.
fs.cpSync(path.join(here, "drizzle"), path.join(outdir, "drizzle"), {
  recursive: true,
});

console.log(`Bundled to ${outdir}`);
