import type { ProjectId, TaskId } from "@mono/api";
import { and, eq, inArray } from "drizzle-orm";
import { runsTable, tasksTable } from "../db";
import type { Result } from "../utils/Result";
import { getTransaction } from "../utils/transaction-context";
import type { RunId } from "./RunId";

type RunState = "pending" | "in_progress" | "completed" | "failed";

export interface Run {
  id: RunId;
  taskId: TaskId;
  startedAt: Date;
  completedAt?: Date;
  state: RunState;
}

type RunLogLine = {
  timestamp: Date;
  level: "error" | "warn" | "info" | "debug";
  message: string;
};

export type UpdateRunStateError =
  | { reason: "run-not-found" }
  | { reason: "invalid-state-tansition"; from: RunState; to: RunState };

export interface RunsService {
  createRun(taskId: TaskId): Promise<Run>;
  getRun(runId: RunId): Promise<Run | undefined>;
  updateRunState(
    runId: RunId,
    state: Exclude<RunState, "pending">,
  ): Promise<Result<Run, UpdateRunStateError>>;
  getRunLogs(runId: RunId): AsyncGenerator<RunLogLine>;
  /**
   * Get all active runs (pending or in_progress) for a given project.
   */
  getRunsForProject(projectId: ProjectId): Promise<Run[]>;
  /**
   * Active run state per task (at most one of pending/in_progress per task in practice).
   * If both existed, `in_progress` wins.
   */
  getActiveRunStatesForTasks(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, "pending" | "in_progress">>;
}

const fromRunEntity = (entity: typeof runsTable.$inferSelect): Run => ({
  id: entity.id,
  taskId: entity.taskId as TaskId,
  startedAt: entity.startedAt,
  completedAt: entity.completedAt ?? undefined,
  state: entity.state as RunState,
});

export class DatabaseRunsService implements RunsService {
  async createRun(taskId: TaskId): Promise<Run> {
    const tx = getTransaction();

    const [newRow] = await tx.insert(runsTable).values({ taskId }).returning();

    return fromRunEntity(newRow);
  }

  async getRun(runId: RunId): Promise<Run | undefined> {
    const tx = getTransaction();
    const run = await tx.query.runsTable.findFirst({
      where: eq(runsTable.id, runId),
    });
    return run ? fromRunEntity(run) : undefined;
  }

  /**
   * State transition diagram:
   *
   * ```
   * pending ──▶ in_progress ──▶ completed
   *                  │
   *                  └────────▶ failed
   * ```
   */
  async updateRunState(
    runId: RunId,
    state: Exclude<RunState, "pending">,
  ): Promise<Result<Run, UpdateRunStateError>> {
    const tx = getTransaction();
    const existingRow = await tx.query.runsTable.findFirst({
      where: eq(runsTable.id, runId),
    });

    if (existingRow === undefined) {
      return { success: false, error: { reason: "run-not-found" } };
    }

    if (existingRow.state === "completed" || existingRow.state === "failed") {
      return {
        success: false,
        error: {
          reason: "invalid-state-tansition",
          from: existingRow.state,
          to: state,
        },
      };
    }

    await tx.update(runsTable).set({ state }).where(eq(runsTable.id, runId));
    return { success: true, value: fromRunEntity(existingRow) };
  }

  // TODO: This will need to be implemented using Redis streams, and this method will be used
  //         to stream the logs back to the caller if the stream is still running.
  getRunLogs(_runId: RunId): AsyncGenerator<RunLogLine> {
    throw new Error("Method not implemented.");
  }

  async getRunsForProject(projectId: ProjectId): Promise<Run[]> {
    const tx = getTransaction();
    const runs = await tx
      .select({
        id: runsTable.id,
        taskId: runsTable.taskId,
        startedAt: runsTable.startedAt,
        completedAt: runsTable.completedAt,
        state: runsTable.state,
      })
      .from(runsTable)
      .innerJoin(tasksTable, eq(runsTable.taskId, tasksTable.id))
      .where(
        and(
          eq(tasksTable.projectId, projectId),
          inArray(runsTable.state, ["pending", "in_progress"]),
        ),
      );

    return runs.map(fromRunEntity);
  }

  async getActiveRunStatesForTasks(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, "pending" | "in_progress">> {
    if (taskIds.length === 0) {
      return new Map();
    }
    const tx = getTransaction();
    const rows = await tx
      .select({
        taskId: runsTable.taskId,
        state: runsTable.state,
      })
      .from(runsTable)
      .where(
        and(
          inArray(runsTable.taskId, taskIds),
          inArray(runsTable.state, ["pending", "in_progress"]),
        ),
      );

    const map = new Map<TaskId, "pending" | "in_progress">();
    for (const row of rows) {
      const tid = row.taskId as TaskId;
      const state = row.state as "pending" | "in_progress";
      const existing = map.get(tid);
      if (existing === undefined || state === "in_progress") {
        map.set(tid, state);
      }
    }
    return map;
  }
}
