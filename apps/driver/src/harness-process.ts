import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import type { Readable } from "node:stream";

export type HarnessExecutionResult = {
  exitCode: number;
  signal: NodeJS.Signals | null;
};

export type HarnessStreams = {
  stdout: Readable;
  stderr: Readable;
};

export function executeHarnessCommand(
  options: {
    command: string;
    cwd: string;
  },
  onStreams: (streams: HarnessStreams) => void,
): Promise<HarnessExecutionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-lc", options.command], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    if (child.stdout === null || child.stderr === null) {
      reject(new Error("Failed to capture harness stdout/stderr"));
      return;
    }

    const streams: HarnessStreams = {
      stdout: child.stdout,
      stderr: child.stderr,
    };

    onStreams(streams);

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

  const signalNumber = getSignalNumber(signal);
  if (signalNumber === undefined) {
    return 1;
  }

  return 128 + signalNumber;
}

function getSignalNumber(signal: NodeJS.Signals): number | undefined {
  return osConstants.signals[signal as keyof typeof osConstants.signals];
}
