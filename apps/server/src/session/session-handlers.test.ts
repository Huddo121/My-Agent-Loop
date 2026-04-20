import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionHandlers } from "./session-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock("../auth/session", () => ({
  requireAuthSession,
}));

type SessionGetContext = Parameters<typeof sessionHandlers.GET>[0];
type SessionBootstrapContext = Parameters<
  (typeof sessionHandlers)["bootstrap-workspace"]
>[0];

function createCtx(overrides?: Partial<Record<string, unknown>>) {
  const services = {
    db: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
    },
    workspacesService: {
      getAllWorkspacesForUser: vi.fn(),
      createWorkspaceForUser: vi.fn(),
    },
    workspaceMembershipsService: {
      userHasAnyWorkspace: vi.fn(),
    },
  };

  const ctx = {
    hono: {
      req: {
        raw: new Request("http://localhost/api/session"),
      },
    },
    services,
    body: { name: "Workspace One" },
    ...overrides,
  };

  return ctx;
}

describe("session handlers", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
  });

  it("returns 401 when the current request is anonymous", async () => {
    requireAuthSession.mockResolvedValueOnce(null);

    const response = await sessionHandlers.GET(
      createCtx() as unknown as SessionGetContext,
    );

    expect(response[0]).toBe(401);
  });

  it("returns the authenticated app session and bootstrap state", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "user@example.com" },
    });
    const ctx = createCtx();
    ctx.services.workspacesService.getAllWorkspacesForUser.mockResolvedValueOnce(
      [{ id: "workspace-1", name: "Workspace One", createdAt: new Date() }],
    );

    const response = await sessionHandlers.GET(
      ctx as unknown as SessionGetContext,
    );

    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({
      user: { id: "user-1" },
      needsWorkspaceBootstrap: false,
      workspaces: [{ id: "workspace-1" }],
    });
  });

  it("creates the first workspace during bootstrap", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1", email: "user@example.com" },
    });
    const ctx = createCtx();
    ctx.services.workspaceMembershipsService.userHasAnyWorkspace.mockResolvedValueOnce(
      false,
    );
    ctx.services.workspacesService.createWorkspaceForUser.mockResolvedValueOnce(
      {
        id: "workspace-1",
        name: "Workspace One",
      },
    );

    const response = await sessionHandlers["bootstrap-workspace"](
      ctx as unknown as SessionBootstrapContext,
    );

    expect(
      ctx.services.workspacesService.createWorkspaceForUser,
    ).toHaveBeenCalledWith("user-1", {
      name: "Workspace One",
    });
    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({ id: "workspace-1" });
  });
});
