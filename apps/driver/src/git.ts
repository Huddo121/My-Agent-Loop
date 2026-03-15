import { spawn } from "node:child_process";

export async function getHeadCommit(cwd: string): Promise<string> {
  return runGit(cwd, ["rev-parse", "HEAD"]);
}

export async function commitWorkingTree(options: {
  cwd: string;
  message: string;
}): Promise<string> {
  const status = await runGit(options.cwd, ["status", "--porcelain"]);
  if (status.length === 0) {
    return getHeadCommit(options.cwd);
  }

  await runGit(options.cwd, ["add", "-A"]);
  await runGit(options.cwd, ["commit", "-m", options.message]);
  return getHeadCommit(options.cwd);
}

export async function resetWorkingTree(options: {
  cwd: string;
  commitish: string;
}): Promise<void> {
  await runGit(options.cwd, ["reset", "--hard", options.commitish]);
  await runGit(options.cwd, ["clean", "-fd"]);
}

function runGit(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          `git ${args.join(" ")} failed with code ${code ?? "unknown"}: ${stderr.trim()}`,
        ),
      );
    });
  });
}
