import type {
  ProjectId,
  ProjectShortCode,
  TaskId,
  WorkspaceId,
} from "@mono/api";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db";
import type { ForgeSecretRepository } from "../forge-secrets";
import { LiveEventsService } from "../live-events";
import type { Project, ProjectsService } from "../projects/ProjectsService";
import type { RunId } from "../runs/RunId";
import type { Run, RunsService } from "../runs/RunsService";
import type { Task, TaskQueue } from "../task-queue";
import { ProtectedString } from "../utils/ProtectedString";
import {
  DatabaseWorkflowManager,
  type WorkflowManager,
} from "./WorkflowManager";
import { WorkflowMessengerService } from "./WorkflowMessengerService";
import type { WorkflowQueues } from "./workflow-queues";

describe("DatabaseWorkflowManager", () => {
  it("adds the run job after the run creation transaction commits", async () => {
    const harness = createHarness({ queueState: "idle" });
    const workflowManager = harness.workflowManager;

    const result = await workflowManager.startWorkflow(
      harness.project.id,
      "single",
    );

    expect(result).toEqual({ success: true, value: harness.run.id });
    expect(harness.queueAddTransactionStates).toEqual([false]);
    expect(harness.runQueue.add).toHaveBeenCalledWith(`run-${harness.run.id}`, {
      projectId: harness.project.id,
      taskId: harness.task.id,
      runId: harness.run.id,
    });
  });

  it("adds loop continuation jobs after the run creation transaction commits", async () => {
    const harness = createHarness({ queueState: "processing-loop" });

    await (
      harness.workflowManager as unknown as {
        handleRunCompleted(projectId: ProjectId, runId: RunId): Promise<void>;
      }
    ).handleRunCompleted(harness.project.id, "completed-run" as RunId);

    expect(harness.queueAddTransactionStates).toEqual([false]);
    expect(harness.runQueue.add).toHaveBeenCalledWith(`run-${harness.run.id}`, {
      projectId: harness.project.id,
      taskId: harness.task.id,
      runId: harness.run.id,
    });
  });
});

function createHarness(options: { queueState: Project["queueState"] }) {
  const transactionState = { inTransaction: false };
  const db = createTransactionTrackingDb(transactionState);
  const project = createProject(options.queueState);
  const task = createTask();
  const run = createRun(task.id);
  const queueAddTransactionStates: boolean[] = [];
  const runQueue = {
    add: vi.fn(async () => {
      queueAddTransactionStates.push(transactionState.inTransaction);
      return { id: "job-1" };
    }),
  };

  const workflowManager: WorkflowManager = new DatabaseWorkflowManager(
    new WorkflowMessengerService(),
    createTaskQueue(task),
    createRunsService(run),
    createProjectsService(project),
    { runQueue } as unknown as WorkflowQueues,
    db,
    new LiveEventsService(),
    createForgeSecretRepository(),
  );

  return {
    project,
    queueAddTransactionStates,
    run,
    runQueue,
    task,
    workflowManager,
  };
}

function createTransactionTrackingDb(state: { inTransaction: boolean }) {
  return {
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      state.inTransaction = true;
      try {
        return await fn({});
      } finally {
        state.inTransaction = false;
      }
    },
  } as unknown as Database;
}

function createTaskQueue(task: Task): TaskQueue {
  return {
    addTask: vi.fn(),
    completeTask: vi.fn(),
    getAllTasks: vi.fn(),
    getNextTask: vi.fn(async () => task),
    getProjectIdForTask: vi.fn(),
    getTask: vi.fn(),
    isEmpty: vi.fn(),
    moveTask: vi.fn(),
    taskCount: vi.fn(),
    updateTask: vi.fn(),
  };
}

function createRunsService(run: Run): RunsService {
  return {
    createRun: vi.fn(async () => run),
    getRun: vi.fn(),
    getRunLogs: vi.fn(),
    getRunsForProject: vi.fn(),
    updateRunState: vi.fn(),
  };
}

function createProjectsService(project: Project): ProjectsService {
  return {
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    getAllProjects: vi.fn(),
    getProject: vi.fn(async () => project),
    getProjectByShortCode: vi.fn(),
    updateProject: vi.fn(),
    updateProjectQueueState: vi.fn(async (_projectId, queueState) => ({
      ...project,
      queueState,
    })),
  };
}

function createForgeSecretRepository(): ForgeSecretRepository {
  return {
    deleteForgeSecret: vi.fn(),
    getForgeSecret: vi.fn(async () => new ProtectedString("token")),
    hasForgeSecret: vi.fn(async () => false),
    upsertForgeSecret: vi.fn(),
  };
}

function createProject(queueState: Project["queueState"]): Project {
  return {
    id: "project-1" as ProjectId,
    workspaceId: "workspace-1" as WorkspaceId,
    name: "Project",
    shortCode: "PROJ" as ProjectShortCode,
    repositoryUrl: "https://example.com/repo.git",
    workflowConfiguration: {
      version: "1",
      onTaskCompleted: "merge-immediately",
    },
    queueState,
    forgeType: "github",
    forgeBaseUrl: "https://github.com",
    agentConfig: null,
  };
}

function createTask(): Task {
  return {
    id: "task-1" as TaskId,
    title: "Task",
    description: "Do the thing",
    subtasks: [],
  };
}

function createRun(taskId: TaskId): Run {
  return {
    id: "run-1" as RunId,
    taskId,
    startedAt: new Date("2026-04-19T00:00:00.000Z"),
    state: "pending",
  };
}
