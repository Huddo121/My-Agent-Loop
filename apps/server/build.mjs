import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(here, "dist");
const outfile = path.join(outdir, "index.js");

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
  entryPoints: [path.join(here, "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile,
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

console.log(`Bundled to ${outfile}`);
