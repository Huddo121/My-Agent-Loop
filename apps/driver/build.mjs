import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";

const outdir = "dist-sea";
const entryFile = "src/index.ts";
const outfile = path.join(outdir, "index.cjs");

// Ensure output directory exists
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

await esbuild.build({
  entryPoints: [entryFile],
  bundle: true,
  platform: "node",
  target: "node24",
  outfile,
  format: "cjs",
  external: ["node:*"],
  sourcemap: false,
  minify: false,
  loader: {
    // Ensure zod is bundled properly
    ".ts": "ts",
  },
});

console.log(`Bundled to ${outfile}`);
