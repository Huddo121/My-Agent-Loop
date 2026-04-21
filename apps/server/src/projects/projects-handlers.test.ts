import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectsHandlers } from "./projects-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

const projectRouteHandlers = projectsHandlers[":projectId"];
type ProjectGetContext = Parameters<typeof projectRouteHandlers.GET>[0];

function createCtx(overrides?: { body?: unknown }) {
  const ctx = {
    hono: {
      req: {
        raw: new Request(
          "http://localhost/api/workspaces/workspace-1/projects/project-1",
        ),
        param: () => ({ workspaceId: "workspace-1", projectId: "project-1" }),
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
        canAccessProject: vi.fn(),
      },
      projectsService: {
        getProject: vi.fn(),
        updateProject: vi.fn(),
      },
      forgeSecretRepository: {
        hasForgeSecret: vi.fn(),
        upsertForgeSecret: vi.fn(),
      },
      liveEventsService: {
        publish: vi.fn().mockResolvedValue(undefined),
      },
    },
  };

  return ctx;
}

describe("projects handlers", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
  });

  it("returns 404 when the project is outside the caller membership", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx();
    ctx.services.workspaceMembershipsService.canAccessProject.mockResolvedValueOnce(
      false,
    );

    const response = await projectsHandlers[":projectId"].GET(
      ctx as unknown as ProjectGetContext,
    );

    expect(response[0]).toBe(404);
  });

  it("publishes project.updated when updating a project", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      body: { name: "Updated name" },
    });
    ctx.services.workspaceMembershipsService.canAccessProject.mockResolvedValueOnce(
      true,
    );
    ctx.services.projectsService.updateProject.mockResolvedValueOnce({
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Updated name",
      shortCode: "PRJ",
      repositoryUrl: "https://github.com/owner/repo",
      workflowConfiguration: {
        version: "1",
        onTaskCompleted: "push-branch",
      },
      queueState: "idle",
      forgeType: "github",
      forgeBaseUrl: "https://github.com",
      agentConfig: null,
    });
    ctx.services.forgeSecretRepository.hasForgeSecret.mockResolvedValueOnce(
      false,
    );

    const response = await projectsHandlers[":projectId"].PATCH(
      ctx as unknown as Parameters<
        (typeof projectsHandlers)[":projectId"]["PATCH"]
      >[0],
    );

    expect(response[0]).toBe(200);
    expect(ctx.services.liveEventsService.publish).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        type: "project.updated",
        project: expect.objectContaining({
          id: "project-1",
          name: "Updated name",
          hasForgeToken: false,
        }),
      }),
    );
  });
});
