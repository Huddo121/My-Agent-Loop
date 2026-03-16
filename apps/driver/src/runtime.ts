import type { DriverInvocation } from "./cli";
import { executeHarnessCommand } from "./harness-process";
import { HostApiClient } from "./host-api";

export async function runDriver(invocation: DriverInvocation): Promise<void> {
  const hostApiClient = new HostApiClient({
    baseUrl: invocation.hostApiBaseUrl,
    runId: invocation.runId,
    taskId: invocation.taskId,
    driverToken: invocation.driverToken,
  });

  await hostApiClient.sendLifecycleEvent({
    kind: "harness-starting",
    harnessCommand: invocation.harnessCommand,
  });

  const harnessResult = await executeHarnessCommand({
    command: invocation.harnessCommand,
    cwd: process.cwd(),
  });

  await hostApiClient.sendLifecycleEvent({
    kind: "harness-exited",
    exitCode: harnessResult.exitCode,
    signal: harnessResult.signal,
  });

  process.exitCode = harnessResult.exitCode;
}
