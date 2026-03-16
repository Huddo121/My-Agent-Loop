import type { DriverInvocation } from "./cli";
import { executeHarnessCommand } from "./harness-process";
import { HostApiClient } from "./host-api";
import { detectProgress, hasSubtasks } from "./progress";
import { RetryController } from "./retry";
import { type DriverTaskFile, loadTaskFile, saveTaskFile } from "./task-file";

export async function runDriver(invocation: DriverInvocation): Promise<void> {
  const workingDirectory = process.cwd();
  const hostApiClient = new HostApiClient({
    baseUrl: invocation.hostApiBaseUrl,
    runId: invocation.runId,
    taskId: invocation.taskId,
    subtaskId: invocation.subtaskId,
    driverToken: invocation.driverToken,
  });
  const retryController = new RetryController(invocation.retryLimit);

  const initialSnapshotResult = await loadTaskFile(invocation.taskFilePath);
  if (initialSnapshotResult.success === false) {
    throw initialSnapshotResult.error;
  }

  let checkpointSnapshot = initialSnapshotResult.value;
  let iteration = 1;

  while (true) {
    console.log(
      `Starting driver iteration ${iteration} for run ${invocation.runId} task ${invocation.taskId}.`,
    );

    const harnessResult = await executeHarnessCommand({
      command: invocation.harnessCommand,
      cwd: workingDirectory,
    });

    const latestSnapshot = await mustLoadTaskFile(invocation.taskFilePath);
    const progress = detectProgress(checkpointSnapshot, latestSnapshot);

    await hostApiClient.syncTaskSnapshot({
      taskSnapshot: latestSnapshot,
      subtaskId: invocation.subtaskId,
      iteration,
      harnessExitCode: harnessResult.exitCode,
      progressState: progress.kind,
      progressReason: progress.reason,
    });

    if (!hasSubtasks(latestSnapshot)) {
      if (harnessResult.exitCode === 0) {
        return;
      }

      const retryDecision = retryController.recordFailure();
      if (retryDecision.kind === "exhausted") {
        throw new Error(
          `Harness failed for single-task run after ${invocation.retryLimit} retries.`,
        );
      }

      await rollbackIteration({
        taskFilePath: invocation.taskFilePath,
        checkpointSnapshot,
      });

      iteration += 1;
      continue;
    }

    if (progress.kind === "complete") {
      return;
    }

    if (progress.kind === "progress") {
      checkpointSnapshot = latestSnapshot;
      retryController.recordProgress();
      iteration += 1;
      continue;
    }

    const retryDecision = retryController.recordFailure();
    if (retryDecision.kind === "exhausted") {
      throw new Error(
        `No progress detected after ${invocation.retryLimit} retries: ${progress.reason}`,
      );
    }

    await rollbackIteration({
      taskFilePath: invocation.taskFilePath,
      checkpointSnapshot,
    });

    iteration += 1;
  }
}

async function mustLoadTaskFile(taskFilePath: string): Promise<DriverTaskFile> {
  const result = await loadTaskFile(taskFilePath);
  if (result.success === false) {
    throw result.error;
  }

  return result.value;
}

async function rollbackIteration(options: {
  taskFilePath: string;
  checkpointSnapshot: DriverTaskFile;
}): Promise<void> {
  const writeResult = await saveTaskFile(
    options.taskFilePath,
    options.checkpointSnapshot,
  );
  if (writeResult.success === false) {
    throw writeResult.error;
  }
}
