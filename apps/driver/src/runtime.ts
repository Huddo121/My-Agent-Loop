import type { DriverInvocation } from "./cli";
import { executeHarnessCommand } from "./harness-process";
import { HostApiClient } from "./host-api";

async function forwardStream(
  stream: NodeJS.ReadableStream,
  hostApiClient: HostApiClient,
  streamType: "stdout" | "stderr",
  pendingLogSends: Set<Promise<void>>,
): Promise<void> {
  for await (const chunk of stream) {
    const message = chunk.toString();
    if (message.length > 0) {
      const pendingSend = reportLog(hostApiClient, {
        message,
        stream: streamType,
      }).finally(() => {
        pendingLogSends.delete(pendingSend);
      });

      pendingLogSends.add(pendingSend);
    }
  }
}

export async function runDriver(invocation: DriverInvocation): Promise<void> {
  const hostApiClient = new HostApiClient({
    baseUrl: invocation.hostApiBaseUrl,
    runId: invocation.runId,
    driverToken: invocation.driverToken,
  });

  await reportLifecycleEvent(hostApiClient, {
    kind: "harness-starting",
    harnessCommand: invocation.harnessCommand,
  });

  let stdoutForwarding: Promise<void> = Promise.resolve();
  let stderrForwarding: Promise<void> = Promise.resolve();
  const pendingLogSends = new Set<Promise<void>>();

  const harnessResult = await executeHarnessCommand(
    {
      command: invocation.harnessCommand,
      cwd: process.cwd(),
    },
    (streams) => {
      stdoutForwarding = forwardStream(
        streams.stdout,
        hostApiClient,
        "stdout",
        pendingLogSends,
      );
      stderrForwarding = forwardStream(
        streams.stderr,
        hostApiClient,
        "stderr",
        pendingLogSends,
      );
    },
  );

  await Promise.all([stdoutForwarding, stderrForwarding]);
  await Promise.all(pendingLogSends);

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
