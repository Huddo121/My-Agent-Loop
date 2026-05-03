import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const outdir = "dist-sea";
const bundleFile = path.join(outdir, "index.cjs");
const seaBlobFile = path.join(outdir, "sea-blob.blob");
const seaExeFile =
  process.env.MAL_CLI_SEA_OUTPUT_FILE ?? path.join(outdir, "mal-cli");
const nodeBinaryPath = process.env.MAL_CLI_SEA_NODE_BINARY ?? process.execPath;
const sentinelFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const injectionRequired = process.env.MAL_CLI_SEA_INJECTION_REQUIRED === "1";

if (!fs.existsSync(bundleFile)) {
  console.error("Bundle file not found. Run build:bundle first.");
  process.exit(1);
}

console.log("Generating SEA blob...");

const seaConfig = {
  main: bundleFile,
  output: seaBlobFile,
};

const configFile = path.join(outdir, "sea-config.json");
fs.writeFileSync(configFile, JSON.stringify(seaConfig, null, 2));

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
fs.copyFileSync(nodeBinaryPath, seaExeFile);
fs.chmodSync(seaExeFile, 0o755);

console.log("Attempting to inject blob into executable...");
try {
  const machoSegmentOption =
    process.platform === "darwin" ? " --macho-segment-name NODE_SEA" : "";

  execSync(
    `npx postject "${seaExeFile}" NODE_SEA_BLOB "${seaBlobFile}" --overwrite --sentinel-fuse ${sentinelFuse}${machoSegmentOption}`,
    {
      stdio: "inherit",
    },
  );

  if (process.platform === "darwin") {
    execSync(`codesign --sign - "${seaExeFile}"`, {
      stdio: "inherit",
    });
  }

  console.log(`SEA executable created at ${seaExeFile}`);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (injectionRequired) {
    console.error(
      `Failed to inject SEA blob into executable at ${seaExeFile}: ${errorMessage}`,
    );
    process.exit(1);
  }

  console.log("Warning: Could not inject SEA blob into executable.");
  console.log(
    "This is expected when cross-compiling or on platforms without the sentinel.",
  );
  console.log("Injection error:", errorMessage);
  console.log("");
  console.log("Bundle created at:", bundleFile);
  console.log("Blob created at:", seaBlobFile);
}
