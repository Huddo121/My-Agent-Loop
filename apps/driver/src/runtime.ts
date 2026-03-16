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
      await reportLog(hostApiClient, {
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

  await reportLifecycleEvent(hostApiClient, {
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

  await reportLifecycleEvent(hostApiClient, {
    kind: "harness-exited",
    exitCode: harnessResult.exitCode,
    signal: harnessResult.signal,
  });

  process.exitCode = harnessResult.exitCode;
}

async function reportLifecycleEvent(
  hostApiClient: HostApiClient,
  event: Parameters<HostApiClient["sendLifecycleEvent"]>[0],
): Promise<void> {
  try {
    await hostApiClient.sendLifecycleEvent(event);
  } catch (error) {
    console.error("Failed to report lifecycle event to host:", error);
  }
}

async function reportLog(
  hostApiClient: HostApiClient,
  params: Parameters<HostApiClient["sendLog"]>[0],
): Promise<void> {
  try {
    await hostApiClient.sendLog(params);
  } catch (error) {
    console.error("Failed to report log to host:", error);
  }
}
