import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const outdir = "dist-sea";
const bundleFile = path.join(outdir, "index.cjs");
const seaBlobFile = path.join(outdir, "sea-blob.blob");
const seaExeFile =
  process.env.DRIVER_SEA_OUTPUT_FILE ?? path.join(outdir, "driver");
const nodeBinaryPath = process.env.DRIVER_SEA_NODE_BINARY ?? process.execPath;
const sentinelFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// Check if the bundle exists
if (!fs.existsSync(bundleFile)) {
  console.error("Bundle file not found. Run build:bundle first.");
  process.exit(1);
}

// Generate the SEA blob using the experimental-sea-config
console.log("Generating SEA blob...");

// For Node.js 24.x, we use the older approach
const seaConfig = {
  main: bundleFile,
  output: seaBlobFile,
};

const configFile = path.join(outdir, "sea-config.json");
fs.writeFileSync(configFile, JSON.stringify(seaConfig, null, 2));

// Generate the blob using node
try {
  execSync(
    `node --experimental-sea-config "${configFile}" "${bundleFile}" -o "${seaBlobFile}"`,
    {
      stdio: "inherit",
    },
  );
} catch (error) {
  console.error(
    "Failed to generate SEA blob:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}

console.log("Blob generated, creating executable...");

if (!fs.existsSync(nodeBinaryPath)) {
  console.error(`Node binary not found at ${nodeBinaryPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(seaExeFile), { recursive: true });

// Copy the node binary to the output location
fs.copyFileSync(nodeBinaryPath, seaExeFile);

// Make it executable
fs.chmodSync(seaExeFile, 0o755);

// Try to inject the blob using postject
// This may fail on platforms where the node binary doesn't have the sentinel
// (e.g., some macOS builds, or when cross-compiling for a different platform)
console.log("Attempting to inject blob into executable...");
try {
  execSync(
    `npx postject "${seaExeFile}" NODE_SEA_BLOB "${seaBlobFile}" --overwrite --sentinel-fuse ${sentinelFuse}`,
    {
      stdio: "inherit",
    },
  );
  console.log(`SEA executable created at ${seaExeFile}`);
} catch (error) {
  console.log("Warning: Could not inject SEA blob into executable.");
  console.log(
    "This is expected when cross-compiling or on platforms without the sentinel.",
  );
  console.log(
    "Injection error:",
    error instanceof Error ? error.message : String(error),
  );
  console.log("");
  console.log("Bundle created at:", bundleFile);
  console.log("Blob created at:", seaBlobFile);
  // Don't fail the build - we still have the bundle
}
