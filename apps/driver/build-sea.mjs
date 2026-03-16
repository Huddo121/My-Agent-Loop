import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const outdir = "dist-sea";
const bundleFile = path.join(outdir, "index.cjs");
const seaBlobFile = path.join(outdir, "sea-blob.blob");
const seaExeFile = path.join(outdir, "driver");

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
} catch (e) {
  console.error("Failed to generate SEA blob:", e.message);
  process.exit(1);
}

console.log("Blob generated, creating executable...");

// Get the path to the current node executable
const nodePath = process.execPath;

// Copy the node binary to the output location
fs.copyFileSync(nodePath, seaExeFile);

// Make it executable
fs.chmodSync(seaExeFile, 0o755);

// Try to inject the blob using postject
// This may fail on platforms where the node binary doesn't have the sentinel
// (e.g., some macOS builds, or when cross-compiling for a different platform)
console.log("Attempting to inject blob into executable...");
try {
  execSync(
    `npx postject "${seaExeFile}" NODE_SEA_BLOB "${seaBlobFile}" --overwrite`,
    {
      stdio: "inherit",
    },
  );
  console.log(`SEA executable created at ${seaExeFile}`);
} catch (e) {
  console.log("Warning: Could not inject SEA blob into executable.");
  console.log(
    "This is expected when cross-compiling or on platforms without the sentinel.",
  );
  console.log("The Docker build will create the proper SEA executable.");
  console.log("");
  console.log("Bundle created at:", bundleFile);
  console.log("Blob created at:", seaBlobFile);
  // Don't fail the build - we still have the bundle
}
