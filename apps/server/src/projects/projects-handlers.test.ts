import type {
  AgentHarnessId,
  ProjectId,
  ProjectShortCode,
  WorkspaceId,
} from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import type { HarnessAvailability } from "../harness/HarnessAuthService";
import {
  FakeDatabase,
  FakeForgeSecretRepository,
  FakeProjectsService,
  FakeWorkspaceMembershipsService,
  RecordingLiveEventsService,
} from "../test-fakes";
import { projectsHandlers } from "./projects-handlers";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

const projectRouteHandlers = projectsHandlers[":projectId"];
type ProjectGetContext = Parameters<typeof projectRouteHandlers.GET>[0];
type ProjectPatchContext = Parameters<typeof projectRouteHandlers.PATCH>[0];

function createCtx(overrides?: {
  body?: unknown;
  harnessAvailability?: HarnessAvailability;
}) {
  const db = new FakeDatabase();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();
  const projectsService = new FakeProjectsService();
  const forgeSecretRepository = new FakeForgeSecretRepository();
  const liveEventsService = new RecordingLiveEventsService();
  const harnessAvailability = overrides?.harnessAvailability ?? {
    isAvailable: false,
    source: "none",
  };

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
      db: db.asDatabase(),
      workspaceMembershipsService,
      projectsService,
      forgeSecretRepository,
      liveEventsService,
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

function seedProject(ctx: ReturnType<typeof createCtx>) {
  const projects = ctx.services.projectsService as FakeProjectsService;
  projects.seed({
    id: "project-1" as ProjectId,
    workspaceId: "workspace-1" as WorkspaceId,
    name: "Original",
    shortCode: "PRJ" as ProjectShortCode,
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

describe("projects handlers", () => {
  beforeEach(() => {
    requireAuthSession.mockReset();
  });

  it("returns 404 when the project is outside the caller membership", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx();

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
    grantProjectAccess(ctx);
    seedProject(ctx);

    const response = await projectsHandlers[":projectId"].PATCH(
      ctx as unknown as Parameters<
        (typeof projectsHandlers)[":projectId"]["PATCH"]
      >[0],
    );

    expect(response[0]).toBe(200);
    const live = ctx.services.liveEventsService as RecordingLiveEventsService;
    expect(live.publishes).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        event: expect.objectContaining({
          type: "project.updated",
          project: expect.objectContaining({
            id: "project-1",
            name: "Updated name",
            hasForgeToken: false,
          }),
        }),
      }),
    ]);
  });

  it("accepts Codex project config when workspace-scoped auth is available", async () => {
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
    grantProjectAccess(ctx);
    seedProject(ctx);

    const response = await projectsHandlers[":projectId"].PATCH(
      ctx as unknown as ProjectPatchContext,
    );

    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({
      agentConfig: { harnessId: "codex-cli", modelId: null },
    });
  });

  it("rejects Codex project config when no accepted credential source exists", async () => {
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
    grantProjectAccess(ctx);
    seedProject(ctx);

    const response = await projectsHandlers[":projectId"].PATCH(
      ctx as unknown as ProjectPatchContext,
    );

    expect(response[0]).toBe(400);
    expect(response[1]).toMatchObject({
      message:
        'Agent harness "codex-cli" is not available (credentials not configured).',
    });
  });
});
