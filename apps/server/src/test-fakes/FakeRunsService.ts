import type { ProjectId, TaskId } from "@mono/api";
import type { RunId } from "../runs/RunId";
import type {
  Run,
  RunsService,
  UpdateRunStateError,
} from "../runs/RunsService";
import type { Result } from "../utils/Result";

type RunState = Run["state"];

/**
 * In-memory runs for tests (driver API, handlers, workflow).
 */
export class FakeRunsService implements RunsService {
  private readonly runs = new Map<RunId, Run>();
  getRunCallCount = 0;

  /** Optional factory used by `createRun` (e.g. workflow tests). */
  createRunImpl: (taskId: TaskId) => Promise<Run> = async (taskId) => ({
    id: `run-${this.runs.size + 1}` as RunId,
    taskId,
    startedAt: new Date(),
    state: "pending",
  });

  /** Active run state per task; defaults empty. */
  readonly activeStatesForTasks = new Map<TaskId, "pending" | "in_progress">();

  seedRun(run: Run): void {
    this.runs.set(run.id, run);
  }

  async createRun(taskId: TaskId): Promise<Run> {
    const run = await this.createRunImpl(taskId);
    this.runs.set(run.id, run);
    return run;
  }

  async getRun(runId: RunId): Promise<Run | undefined> {
    this.getRunCallCount++;
    return this.runs.get(runId);
  }

  async updateRunState(
    runId: RunId,
    state: Exclude<RunState, "pending">,
  ): Promise<Result<Run, UpdateRunStateError>> {
    const existing = this.runs.get(runId);
    if (existing === undefined) {
      return { success: false, error: { reason: "run-not-found" } };
    }
    if (existing.state === "completed" || existing.state === "failed") {
      return {
        success: false,
        error: {
          reason: "invalid-state-tansition",
          from: existing.state,
          to: state,
        },
      };
    }
    const next: Run = { ...existing, state };
    this.runs.set(runId, next);
    return { success: true, value: next };
  }

  async *getRunLogs(_runId: RunId): AsyncGenerator<never, void, void> {
    // empty
  }

  async getRunsForProject(_projectId: ProjectId): Promise<Run[]> {
    return [];
  }

  async getActiveRunStatesForTasks(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, "pending" | "in_progress">> {
    const map = new Map<TaskId, "pending" | "in_progress">();
    for (const id of taskIds) {
      const s = this.activeStatesForTasks.get(id);
      if (s !== undefined) map.set(id, s);
    }
    return map;
  }
}
