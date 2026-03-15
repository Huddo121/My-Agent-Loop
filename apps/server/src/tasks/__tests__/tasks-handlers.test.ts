import { beforeEach, describe, expect, it, vi } from "vitest";
import { tasksHandlers } from "../tasks-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock("../../auth/session", () => ({
  requireAuthSession,
}));

const taskRouteHandlers = tasksHandlers[":taskId"];
type TaskGetContext = Parameters<typeof taskRouteHandlers.GET>[0];

function createCtx() {
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
    services: {
      db: {
        transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({}),
        ),
      },
      workspaceMembershipsService: {
        canAccessTask: vi.fn(),
      },
      taskQueue: {
        getTask: vi.fn(),
      },
      agentHarnessConfigRepository: {
        getTaskConfig: vi.fn(),
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
});
