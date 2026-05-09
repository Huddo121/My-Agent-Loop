import type { AgentHarnessId, WorkspaceId } from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import type { HarnessAvailability } from "../harness/HarnessAuthService";
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
type WorkspaceRoutePatchContext = Parameters<
  typeof workspaceRouteHandlers.PATCH
>[0];
type WorkspaceHarnessesGetContext = Parameters<
  typeof workspaceRouteHandlers.harnesses.GET
>[0];

function createCtx(overrides?: {
  body?: unknown;
  harnessAvailability?: HarnessAvailability;
}) {
  const db = new FakeDatabase();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();
  const workspacesService = new FakeWorkspacesService();
  const harnessAvailability = overrides?.harnessAvailability ?? {
    isAvailable: false,
    source: "none",
  };

  const ctx = {
    hono: {
      req: {
        raw: new Request("http://localhost/api/workspaces/workspace-1"),
        param: () => ({ workspaceId: "workspace-1" }),
      },
    },
    body: overrides?.body ?? {},
    services: {
      db: db.asDatabase(),
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

  it("marks Codex available when workspace-scoped auth is available", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      harnessAvailability: {
        isAvailable: true,
        source: "workspace-owner-oauth",
      },
    });
    const memberships = ctx.services
      .workspaceMembershipsService as FakeWorkspaceMembershipsService;
    memberships.grantWorkspaceMember(
      "user-1" as UserId,
      "workspace-1" as WorkspaceId,
    );
    memberships.grantWorkspaceMember(
      "workspace-owner" as UserId,
      "workspace-1" as WorkspaceId,
    );
    const workspaces = ctx.services.workspacesService as FakeWorkspacesService;
    workspaces.seedWorkspaceForUser("user-1" as UserId, {
      id: "workspace-1" as WorkspaceId,
      name: "Workspace",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      agentConfig: null,
    });

    const response = await workspacesHandlers[":workspaceId"].harnesses.GET(
      ctx as unknown as WorkspaceHarnessesGetContext,
    );

    expect(response[0]).toBe(200);
    expect(response[1]).toEqual({
      harnesses: [
        {
          id: "codex-cli",
          displayName: "Codex CLI",
          isAvailable: true,
          models: [],
        },
      ],
    });
    expect(
      ctx.services.harnessAuthService.getAvailability,
    ).toHaveBeenCalledWith("codex-cli", {
      kind: "workspace-owner",
      workspaceOwnerUserId: "user-1",
    });
  });

  it("accepts Codex workspace config when workspace-scoped auth is available", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      body: {
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
    const memberships = ctx.services
      .workspaceMembershipsService as FakeWorkspaceMembershipsService;
    memberships.grantWorkspaceMember(
      "user-1" as UserId,
      "workspace-1" as WorkspaceId,
    );
    const workspaces = ctx.services.workspacesService as FakeWorkspacesService;
    workspaces.seedWorkspaceForUser("user-1" as UserId, {
      id: "workspace-1" as WorkspaceId,
      name: "Workspace",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      agentConfig: null,
    });

    const response = await workspacesHandlers[":workspaceId"].PATCH(
      ctx as unknown as WorkspaceRoutePatchContext,
    );

    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({
      agentConfig: { harnessId: "codex-cli", modelId: null },
    });
  });

  it("rejects Codex workspace config when no accepted credential source exists", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx({
      body: {
        agentConfig: {
          harnessId: "codex-cli",
          modelId: null,
        },
      },
      harnessAvailability: { isAvailable: false, source: "none" },
    });
    const memberships = ctx.services
      .workspaceMembershipsService as FakeWorkspaceMembershipsService;
    memberships.grantWorkspaceMember(
      "user-1" as UserId,
      "workspace-1" as WorkspaceId,
    );
    const workspaces = ctx.services.workspacesService as FakeWorkspacesService;
    workspaces.seedWorkspaceForUser("user-1" as UserId, {
      id: "workspace-1" as WorkspaceId,
      name: "Workspace",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      agentConfig: null,
    });

    const response = await workspacesHandlers[":workspaceId"].PATCH(
      ctx as unknown as WorkspaceRoutePatchContext,
    );

    expect(response[0]).toBe(400);
    expect(response[1]).toMatchObject({
      message:
        'Agent harness "codex-cli" is not available (credentials not configured).',
    });
  });
});
