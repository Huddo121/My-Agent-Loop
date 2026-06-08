import type { ProjectId, WorkspaceId } from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import {
  FakeDatabase,
  FakeSandboxTypeConfigRepository,
  FakeWorkspaceMembershipsService,
} from "../test-fakes";
import { projectSandboxTypeHandlers } from "./project-sandbox-type-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

type SandboxTypeGetContext = Parameters<
  typeof projectSandboxTypeHandlers.GET
>[0];
type SandboxTypePutContext = Parameters<
  typeof projectSandboxTypeHandlers.PUT
>[0];

function createCtx(overrides?: { body?: unknown }) {
  const db = new FakeDatabase();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();
  const sandboxTypeConfigRepository = new FakeSandboxTypeConfigRepository();

  const ctx = {
    hono: {
      req: {
        raw: new Request(
          "http://localhost/api/workspaces/workspace-1/projects/project-1/sandbox-type",
        ),
        param: () => ({
          workspaceId: "workspace-1",
          projectId: "project-1",
        }),
      },
    },
    body: overrides?.body ?? {},
    services: {
      db: db.asDatabase(),
      workspaceMembershipsService,
      sandboxTypeConfigRepository,
      logger: { error() {}, warn() {}, info() {}, debug() {} },
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

describe("project sandbox-type handlers", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
  });

  describe("GET", () => {
    it("returns 401 when there is no authenticated session", async () => {
      requireAuthSession.mockResolvedValueOnce(null);
      const ctx = createCtx();

      const response = await projectSandboxTypeHandlers.GET(
        ctx as unknown as SandboxTypeGetContext,
      );

      expect(response[0]).toBe(401);
    });

    it("returns 404 when the caller cannot access the project", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const ctx = createCtx();

      const response = await projectSandboxTypeHandlers.GET(
        ctx as unknown as SandboxTypeGetContext,
      );

      expect(response[0]).toBe(404);
    });

    it("returns null sandboxType when no config is set for the project", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const ctx = createCtx();
      grantProjectAccess(ctx);

      const response = await projectSandboxTypeHandlers.GET(
        ctx as unknown as SandboxTypeGetContext,
      );

      expect(response[0]).toBe(200);
      expect(response[1]).toEqual({ sandboxType: null });
    });

    it("returns the configured sandboxType when one is set", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const ctx = createCtx();
      grantProjectAccess(ctx);
      const repo = ctx.services
        .sandboxTypeConfigRepository as FakeSandboxTypeConfigRepository;
      await repo.setProjectConfig("project-1" as ProjectId, "vm");

      const response = await projectSandboxTypeHandlers.GET(
        ctx as unknown as SandboxTypeGetContext,
      );

      expect(response[0]).toBe(200);
      expect(response[1]).toEqual({ sandboxType: "vm" });
    });
  });

  describe("PUT", () => {
    it("returns 401 when there is no authenticated session", async () => {
      requireAuthSession.mockResolvedValueOnce(null);
      const ctx = createCtx({ body: { sandboxType: "vm" } });

      const response = await projectSandboxTypeHandlers.PUT(
        ctx as unknown as SandboxTypePutContext,
      );

      expect(response[0]).toBe(401);
    });

    it("returns 404 when the caller cannot access the project", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const ctx = createCtx({ body: { sandboxType: "vm" } });

      const response = await projectSandboxTypeHandlers.PUT(
        ctx as unknown as SandboxTypePutContext,
      );

      expect(response[0]).toBe(404);
    });

    it("sets the project sandbox type and echoes it back", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const ctx = createCtx({ body: { sandboxType: "vm" } });
      grantProjectAccess(ctx);

      const response = await projectSandboxTypeHandlers.PUT(
        ctx as unknown as SandboxTypePutContext,
      );

      expect(response[0]).toBe(200);
      expect(response[1]).toEqual({ sandboxType: "vm" });
    });

    it("persists the new sandbox type so a subsequent GET reflects it", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const putCtx = createCtx({ body: { sandboxType: "vm" } });
      grantProjectAccess(putCtx);
      await projectSandboxTypeHandlers.PUT(
        putCtx as unknown as SandboxTypePutContext,
      );

      // Reuse the same context (same fake repo) for the GET
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const getResponse = await projectSandboxTypeHandlers.GET(
        putCtx as unknown as SandboxTypeGetContext,
      );

      expect(getResponse[0]).toBe(200);
      expect(getResponse[1]).toEqual({ sandboxType: "vm" });
    });

    it("clears the project sandbox type when null is provided (inherit from workspace)", async () => {
      requireAuthSession.mockResolvedValueOnce({ user: { id: "user-1" } });
      const ctx = createCtx({ body: { sandboxType: null } });
      grantProjectAccess(ctx);
      const repo = ctx.services
        .sandboxTypeConfigRepository as FakeSandboxTypeConfigRepository;
      await repo.setProjectConfig("project-1" as ProjectId, "vm");

      const response = await projectSandboxTypeHandlers.PUT(
        ctx as unknown as SandboxTypePutContext,
      );

      expect(response[0]).toBe(200);
      expect(response[1]).toEqual({ sandboxType: null });
    });
  });
});
