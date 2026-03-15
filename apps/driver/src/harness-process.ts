import { spawn } from "node:child_process";

export type HarnessExecutionResult = {
  exitCode: number;
  signal: NodeJS.Signals | null;
};

export function executeHarnessCommand(options: {
  command: string;
  cwd: string;
}): Promise<HarnessExecutionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-lc", options.command], {
      cwd: options.cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({
        exitCode: code ?? signalToExitCode(signal),
        signal,
      });
    });
  });
}

function signalToExitCode(signal: NodeJS.Signals | null): number {
  if (signal === null) {
    return 1;
  }

  return 128;
}
