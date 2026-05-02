import type { WorkspaceId } from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import {
  FakeDatabase,
  FakeWorkspaceMembershipsService,
  FakeWorkspacesService,
} from "../test-fakes";
import { sessionHandlers } from "./session-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

type SessionGetContext = Parameters<typeof sessionHandlers.GET>[0];
type SessionBootstrapContext = Parameters<
  (typeof sessionHandlers)["bootstrap-workspace"]
>[0];

function createCtx(overrides?: Partial<Record<string, unknown>>) {
  const db = new FakeDatabase();
  const workspacesService = new FakeWorkspacesService();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();

  const ctx = {
    hono: {
      req: {
        raw: new Request("http://localhost/api/session"),
      },
    },
    services: {
      db: db.asDatabase(),
      workspacesService,
      workspaceMembershipsService,
    },
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
    const workspaces = ctx.services.workspacesService as FakeWorkspacesService;
    workspaces.seedWorkspaceForUser("user-1" as UserId, {
      id: "workspace-1" as WorkspaceId,
      name: "Workspace One",
      createdAt: new Date(),
      agentConfig: null,
    });

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

    const response = await sessionHandlers["bootstrap-workspace"](
      ctx as unknown as SessionBootstrapContext,
    );

    const workspaces = ctx.services.workspacesService as FakeWorkspacesService;
    expect(workspaces.createWorkspaceCalls).toEqual([
      {
        userId: "user-1",
        workspace: { name: "Workspace One" },
      },
    ]);
    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({ id: "workspace-1" });
  });
});
