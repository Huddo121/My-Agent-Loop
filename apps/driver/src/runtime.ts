import type { DriverInvocation } from "./cli";
import { executeHarnessCommand } from "./harness-process";
import { HostApiClient } from "./host-api";

async function forwardStream(
  stream: NodeJS.ReadableStream,
  hostApiClient: HostApiClient,
  streamType: "stdout" | "stderr",
): Promise<void> {
  for await (const chunk of stream) {
    const message = chunk.toString();
    if (message.length > 0) {
      await hostApiClient.sendLog({
        message,
        stream: streamType,
      });
    }
  }
}

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

  let stdoutForwarding: Promise<void> = Promise.resolve();
  let stderrForwarding: Promise<void> = Promise.resolve();

  const harnessResult = await executeHarnessCommand(
    {
      command: invocation.harnessCommand,
      cwd: process.cwd(),
    },
    (streams) => {
      stdoutForwarding = forwardStream(streams.stdout, hostApiClient, "stdout");
      stderrForwarding = forwardStream(streams.stderr, hostApiClient, "stderr");
    },
  );

  // Wait for all log forwarding to complete before sending exit event
  await Promise.all([stdoutForwarding, stderrForwarding]);

  await hostApiClient.sendLifecycleEvent({
    kind: "harness-exited",
    exitCode: harnessResult.exitCode,
    signal: harnessResult.signal,
  });

  process.exitCode = harnessResult.exitCode;
}
