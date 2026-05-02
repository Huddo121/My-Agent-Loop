import type {
  ProjectId,
  ProjectShortCode,
  TaskId,
  TaskNumber,
  WorkspaceId,
} from "@mono/api";
import { describe, expect, it } from "vitest";
import { LiveEventsService } from "../live-events";
import type { Project } from "../projects/ProjectsService";
import type { RunId } from "../runs/RunId";
import type { Run } from "../runs/RunsService";
import type { Task } from "../task-queue";
import {
  createFakeWorkflowRunQueue,
  createTransactionTrackingDatabase,
  FakeAgentHarnessConfigRepository,
  FakeForgeSecretRepository,
  FakeProjectsService,
  FakeRunsService,
  FakeTaskQueue,
} from "../test-fakes";
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
    expect(harness.runQueueAdds).toEqual([
      {
        key: `run-${harness.run.id}`,
        payload: {
          projectId: harness.project.id,
          taskId: harness.task.id,
          runId: harness.run.id,
        },
      },
    ]);
  });

  it("adds loop continuation jobs after the run creation transaction commits", async () => {
    const harness = createHarness({ queueState: "processing-loop" });

    await (
      harness.workflowManager as unknown as {
        handleRunCompleted(projectId: ProjectId, runId: RunId): Promise<void>;
      }
    ).handleRunCompleted(harness.project.id, "completed-run" as RunId);

    expect(harness.queueAddTransactionStates).toEqual([false]);
    expect(harness.runQueueAdds).toEqual([
      {
        key: `run-${harness.run.id}`,
        payload: {
          projectId: harness.project.id,
          taskId: harness.task.id,
          runId: harness.run.id,
        },
      },
    ]);
  });
});

function createHarness(options: { queueState: Project["queueState"] }) {
  const transactionState = { inTransaction: false };
  const { db } = createTransactionTrackingDatabase(transactionState);
  const project = createProject(options.queueState);
  const task = createTask();
  const run = createRun(task.id);
  const {
    runQueue,
    queueAddTransactionStates,
    adds: runQueueAdds,
  } = createFakeWorkflowRunQueue(transactionState);

  const taskQueue = new FakeTaskQueue();
  taskQueue.seedTask(task, project.id);

  const runsService = new FakeRunsService();
  runsService.createRunImpl = async (taskId) => ({
    ...run,
    taskId,
  });
  runsService.activeStatesForTasks.set(task.id, "pending");

  const projectsService = new FakeProjectsService();
  projectsService.seed(project);

  const forgeRepo = new FakeForgeSecretRepository();
  forgeRepo.setPlainSecret(project.id, "token");

  const workflowManager: WorkflowManager = new DatabaseWorkflowManager(
    new WorkflowMessengerService(),
    taskQueue,
    runsService,
    projectsService,
    { runQueue } as unknown as WorkflowQueues,
    db,
    new LiveEventsService(),
    forgeRepo,
    new FakeAgentHarnessConfigRepository(),
  );

  return {
    project,
    queueAddTransactionStates,
    run,
    runQueueAdds,
    task,
    workflowManager,
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
    taskNumber: 1 as TaskNumber,
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
