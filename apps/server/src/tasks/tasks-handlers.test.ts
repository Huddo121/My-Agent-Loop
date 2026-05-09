import type { AgentHarnessId, ProjectId, WorkspaceId } from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import type { HarnessAvailability } from "../harness/HarnessAuthService";
import {
  FakeAgentHarnessConfigRepository,
  FakeDatabase,
  FakeRunsService,
  FakeTaskQueue,
  FakeWorkspaceMembershipsService,
  RecordingLiveEventsService,
} from "../test-fakes";
import { tasksHandlers } from "./tasks-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

const taskRouteHandlers = tasksHandlers[":taskId"];
type TaskGetContext = Parameters<typeof taskRouteHandlers.GET>[0];
type TaskPostContext = Parameters<typeof tasksHandlers.POST>[0];

function createCtx(overrides?: {
  body?: unknown;
  harnessAvailability?: HarnessAvailability;
}) {
  const db = new FakeDatabase();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();
  const taskQueue = new FakeTaskQueue();
  const agentHarnessConfigRepository = new FakeAgentHarnessConfigRepository();
  const liveEventsService = new RecordingLiveEventsService();
  const runsService = new FakeRunsService();
  const harnessAvailability = overrides?.harnessAvailability ?? {
    isAvailable: false,
    source: "none",
  };

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
      db: db.asDatabase(),
      workspaceMembershipsService,
      taskQueue,
      agentHarnessConfigRepository,
      liveEventsService,
      runsService,
      harnessAuthService: {
        getAvailability: vi.fn(async () => harnessAvailability),
        isAvailable: vi.fn(() => harnessAvailability.isAvailable),
      },
      harnesses: [
        {
          id: "codex-cli" as AgentHarnessId,
          displayName: "Codex CLI",
          models: [],
          prepare: vi.fn(),
        },
      ],
    },
  };

  return ctx;
}

function grantProjectAccess(ctx: ReturnType<typeof createCtx>) {
  const memberships = ctx.services
    .workspaceMembershipsService as FakeWorkspaceMembershipsService;
  memberships.grantWorkspaceMember(
    "user-1" as UserId,
    "workspace-1" as WorkspaceId,
  );
  memberships.setProjectWorkspace(
    "project-1" as ProjectId,
    "workspace-1" as WorkspaceId,
  );
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

    const response = await tasksHandlers[":taskId"].GET(
      createCtx() as unknown as TaskGetContext,
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
    grantProjectAccess(ctx);

    const response = await tasksHandlers.POST(
      ctx as unknown as Parameters<typeof tasksHandlers.POST>[0],
    );

    expect(response[0]).toBe(200);
    const live = ctx.services.liveEventsService as RecordingLiveEventsService;
    expect(live.publishes).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        event: expect.objectContaining({
          type: "task.updated",
          projectId: "project-1",
          task: expect.objectContaining({
            id: "task-1",
            taskNumber: 1,
            title: "New task",
            description: "Description",
            activeRunState: null,
          }),
        }),
      }),
    ]);
  });

  it("accepts Codex task config when workspace-scoped auth is available", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      body: {
        title: "New task",
        description: "Description",
        subtasks: [],
        agentConfig: {
          harnessId: "codex-cli",
          modelId: null,
        },
      },
      harnessAvailability: {
        isAvailable: true,
        source: "workspace-owner-oauth",
      },
    });
    grantProjectAccess(ctx);

    const response = await tasksHandlers.POST(
      ctx as unknown as TaskPostContext,
    );

    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({
      agentConfig: { harnessId: "codex-cli", modelId: null },
    });
  });

  it("rejects Codex task config when no accepted credential source exists", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      body: {
        title: "New task",
        description: "Description",
        subtasks: [],
        agentConfig: {
          harnessId: "codex-cli",
          modelId: null,
        },
      },
      harnessAvailability: { isAvailable: false, source: "none" },
    });
    grantProjectAccess(ctx);

    const response = await tasksHandlers.POST(
      ctx as unknown as TaskPostContext,
    );

    expect(response[0]).toBe(400);
    expect(response[1]).toMatchObject({
      message:
        'Agent harness "codex-cli" is not available (credentials not configured).',
    });
  });
});
