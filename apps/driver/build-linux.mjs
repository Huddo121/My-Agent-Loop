import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import https from "node:https";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const outdir = "dist-sea";
const archiveDir = path.join(outdir, ".node-linux");
const arch =
  process.arch === "x64" || process.arch === "arm64" ? process.arch : null;

if (arch === null) {
  console.error(
    `Unsupported architecture for Linux SEA build: ${process.arch}`,
  );
  process.exit(1);
}

const version = process.version.replace(/^v/, "");
const archiveBaseName = `node-v${version}-linux-${arch}`;
const archiveName = `${archiveBaseName}.tar.gz`;
const archivePath = path.join(archiveDir, archiveName);
const extractedDir = path.join(archiveDir, archiveBaseName);
const linuxNodeBinary = path.join(extractedDir, "bin", "node");
const outputFile = path.join(outdir, "driver");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const buildSeaScript = path.join(scriptDir, "build-sea.mjs");

mkdirSync(archiveDir, { recursive: true });

if (!existsSync(linuxNodeBinary)) {
  const url = `https://nodejs.org/dist/v${version}/${archiveName}`;
  console.log(`Downloading ${url} ...`);
  await download(url, archivePath);

  rmSync(extractedDir, { recursive: true, force: true });
  execFileSync("tar", ["-xzf", archivePath, "-C", archiveDir], {
    stdio: "inherit",
  });
}

execFileSync(process.execPath, [buildSeaScript], {
  stdio: "inherit",
  env: {
    ...process.env,
    DRIVER_SEA_NODE_BINARY: linuxNodeBinary,
    DRIVER_SEA_OUTPUT_FILE: outputFile,
  },
});

async function download(url, destination) {
  await new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode !== undefined &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location !== undefined
        ) {
          response.resume();
          download(response.headers.location, destination)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download Node binary: ${response.statusCode ?? "unknown status"}`,
            ),
          );
          response.resume();
          return;
        }

        const fileStream = createWriteStream(destination);
        pipeline(response, fileStream).then(resolve).catch(reject);
      })
      .on("error", reject);
  });
}
