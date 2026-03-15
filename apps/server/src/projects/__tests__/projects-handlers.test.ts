import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectsHandlers } from "../projects-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock("../../auth/session", () => ({
  requireAuthSession,
}));

const projectRouteHandlers = projectsHandlers[":projectId"];
type ProjectGetContext = Parameters<typeof projectRouteHandlers.GET>[0];

function createCtx() {
  const ctx = {
    hono: {
      req: {
        raw: new Request(
          "http://localhost/api/workspaces/workspace-1/projects/project-1",
        ),
        param: () => ({ workspaceId: "workspace-1", projectId: "project-1" }),
      },
    },
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
      },
      forgeSecretRepository: {
        hasForgeSecret: vi.fn(),
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
});
