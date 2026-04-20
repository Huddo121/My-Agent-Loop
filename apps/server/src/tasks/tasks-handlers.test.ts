import { beforeEach, describe, expect, it, vi } from "vitest";
import { tasksHandlers } from "./tasks-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock("../auth/session", () => ({
  requireAuthSession,
}));

const taskRouteHandlers = tasksHandlers[":taskId"];
type TaskGetContext = Parameters<typeof taskRouteHandlers.GET>[0];

function createCtx(overrides?: { body?: unknown }) {
  const ctx = {
    hono: {
      req: {
        raw: new Request(
          "http://localhost/api/workspaces/workspace-1/projects/project-1/tasks/task-1",
        ),
        param: () => ({
          workspaceId: "workspace-1",
          projectId: "project-1",
          taskId: "task-1",
        }),
      },
    },
    body: overrides?.body,
    services: {
      db: {
        transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({}),
        ),
      },
      workspaceMembershipsService: {
        canAccessTask: vi.fn(),
        canAccessProject: vi.fn(),
      },
      taskQueue: {
        getTask: vi.fn(),
        addTask: vi.fn(),
        updateTask: vi.fn(),
        completeTask: vi.fn(),
        moveTask: vi.fn(),
      },
      agentHarnessConfigRepository: {
        getTaskConfig: vi.fn(),
        setTaskConfig: vi.fn(),
      },
      liveEventsService: {
        publish: vi.fn().mockResolvedValue(undefined),
      },
      runsService: {
        getActiveRunStatesForTasks: vi.fn().mockResolvedValue(new Map()),
      },
    },
  };

  return ctx;
}

describe("tasks handlers", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
  });

  it("returns 401 for anonymous task reads", async () => {
    requireAuthSession.mockResolvedValueOnce(null);

    const response = await tasksHandlers[":taskId"].GET(
      createCtx() as unknown as TaskGetContext,
    );

    expect(response[0]).toBe(401);
  });

  it("returns 404 when the task is outside the caller membership", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx();
    ctx.services.workspaceMembershipsService.canAccessTask.mockResolvedValueOnce(
      false,
    );

    const response = await tasksHandlers[":taskId"].GET(
      ctx as unknown as TaskGetContext,
    );

    expect(response[0]).toBe(404);
  });

  it("publishes task.updated when creating a task", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      body: {
        title: "New task",
        description: "Description",
        subtasks: [],
      },
    });
    ctx.services.workspaceMembershipsService.canAccessProject.mockResolvedValueOnce(
      true,
    );
    ctx.services.taskQueue.addTask.mockResolvedValueOnce({
      id: "task-1",
      title: "New task",
      description: "Description",
      completedOn: undefined,
      position: 0,
      subtasks: [],
    });

    const response = await tasksHandlers.POST(
      ctx as unknown as Parameters<typeof tasksHandlers.POST>[0],
    );

    expect(response[0]).toBe(200);
    expect(ctx.services.liveEventsService.publish).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        type: "task.updated",
        projectId: "project-1",
        task: expect.objectContaining({
          id: "task-1",
          title: "New task",
          description: "Description",
          activeRunState: null,
        }),
      }),
    );
  });
});
