import type { DriverTaskFile } from "./task-file";

export type ProgressOutcome =
  | { kind: "none"; reason: string }
  | { kind: "progress"; reason: string }
  | { kind: "complete"; reason: string };

export function detectProgress(
  before: DriverTaskFile,
  after: DriverTaskFile,
): ProgressOutcome {
  if (after.subtasks.length === 0) {
    if (serializeTaskFile(before) !== serializeTaskFile(after)) {
      return {
        kind: "progress",
        reason: "Task file changed during a single-task run.",
      };
    }

    return {
      kind: "none",
      reason: "Single-task run left the task file unchanged.",
    };
  }

  const beforeSummary = summariseSubtasks(before);
  const afterSummary = summariseSubtasks(after);

  if (afterSummary.pending === 0 && afterSummary.inProgress === 0) {
    return {
      kind: "complete",
      reason: "All subtasks are now in terminal states.",
    };
  }

  if (afterSummary.completed > beforeSummary.completed) {
    return {
      kind: "progress",
      reason: "At least one additional subtask is completed.",
    };
  }

  if (afterSummary.terminal > beforeSummary.terminal) {
    return {
      kind: "progress",
      reason: "At least one additional subtask reached a terminal state.",
    };
  }

  if (afterSummary.inProgress > beforeSummary.inProgress) {
    return {
      kind: "progress",
      reason: "More subtasks are marked in progress.",
    };
  }

  if (serializeTaskFile(before) !== serializeTaskFile(after)) {
    return {
      kind: "progress",
      reason: "Task file changed while subtasks are still active.",
    };
  }

  return {
    kind: "none",
    reason: "No forward progress was detected.",
  };
}

export function hasSubtasks(taskFile: DriverTaskFile): boolean {
  return taskFile.subtasks.length > 0;
}

function summariseSubtasks(taskFile: DriverTaskFile): {
  pending: number;
  inProgress: number;
  completed: number;
  terminal: number;
} {
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let terminal = 0;

  for (const subtask of taskFile.subtasks) {
    if (subtask.state === "pending") {
      pending += 1;
    }

    if (subtask.state === "in-progress") {
      inProgress += 1;
    }

    if (subtask.state === "completed") {
      completed += 1;
      terminal += 1;
    }

    if (subtask.state === "cancelled") {
      terminal += 1;
    }
  }

  return { pending, inProgress, completed, terminal };
}

function serializeTaskFile(taskFile: DriverTaskFile): string {
  return JSON.stringify(taskFile);
}
