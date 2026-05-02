import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeDatabase,
  FakeWorkspaceMembershipsService,
  FakeWorkspacesService,
} from "../test-fakes";
import { workspacesHandlers } from "./workspaces-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

type WorkspacesGetContext = Parameters<typeof workspacesHandlers.GET>[0];
const workspaceRouteHandlers = workspacesHandlers[":workspaceId"];
type WorkspaceRouteGetContext = Parameters<
  typeof workspaceRouteHandlers.GET
>[0];

function createCtx() {
  const db = new FakeDatabase();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();
  const workspacesService = new FakeWorkspacesService();

  const ctx = {
    hono: {
      req: {
        raw: new Request("http://localhost/api/workspaces/workspace-1"),
        param: () => ({ workspaceId: "workspace-1" }),
      },
    },
    body: {},
    services: {
      db: db.asDatabase(),
      harnessAuthService: {},
      harnesses: [],
      workspaceMembershipsService,
      workspacesService,
    },
  };

  return ctx;
}

describe("workspaces handlers", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
  });

  it("returns 401 for anonymous workspace list requests", async () => {
    requireAuthSession.mockResolvedValueOnce(null);

    const response = await workspacesHandlers.GET(
      createCtx() as unknown as WorkspacesGetContext,
    );

    expect(response[0]).toBe(401);
  });

  it("returns 404 for workspace reads outside the caller membership", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx();

    const response = await workspacesHandlers[":workspaceId"].GET(
      ctx as unknown as WorkspaceRouteGetContext,
    );

    expect(response[0]).toBe(404);
  });
});
