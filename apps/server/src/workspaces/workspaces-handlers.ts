import {
  badUserInput,
  type MyAgentLoopApi,
  notFound,
  ok,
  unauthenticated,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireAuthSession } from "../auth/session";
import {
  resolveWorkspaceHarnessAuthContext,
  validateAgentConfig,
} from "../harness";
import { projectsHandlers } from "../projects/projects-handlers";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";
import { workspaceSandboxTypeHandlers } from "./workspace-sandbox-type-handlers";

export const workspacesHandlers: HonoHandlersFor<
  ["workspaces"],
  MyAgentLoopApi["workspaces"],
  Services
> = {
  GET: async (ctx) => {
    const authSession = await requireAuthSession(ctx.hono.req.raw);
    if (authSession === null) {
      return unauthenticated();
    }
    return withNewTransaction(ctx.services.db, async () => {
      const workspaces =
        await ctx.services.workspacesService.getAllWorkspacesForUser(
          authSession.user.id,
        );
      return ok(workspaces);
    });
  },
  ":workspaceId": {
    GET: async (ctx) => {
      const { workspaceId } = ctx.hono.req.param();
      const authSession = await requireAuthSession(ctx.hono.req.raw);
      if (authSession === null) {
        return unauthenticated();
      }
      return withNewTransaction(ctx.services.db, async () => {
        const canAccess =
          await ctx.services.workspaceMembershipsService.isWorkspaceMember(
            authSession.user.id,
            workspaceId as WorkspaceId,
          );
        if (!canAccess) {
          return notFound();
        }
        const workspace = await ctx.services.workspacesService.getWorkspace(
          workspaceId as WorkspaceId,
        );
        if (workspace === undefined) {
          return notFound();
        }
        return ok(workspace);
      });
    },
    PATCH: async (ctx) => {
      const { workspaceId } = ctx.hono.req.param();
      const authSession = await requireAuthSession(ctx.hono.req.raw);
      if (authSession === null) {
        return unauthenticated();
      }
      const body = ctx.body;
      return withNewTransaction(ctx.services.db, async () => {
        const canAccess =
          await ctx.services.workspaceMembershipsService.isWorkspaceMember(
            authSession.user.id,
            workspaceId as WorkspaceId,
          );
        if (!canAccess) {
          return notFound();
        }
        const validationError = await validateAgentConfig(body.agentConfig, {
          harnessAuthService: ctx.services.harnessAuthService,
          harnesses: ctx.services.harnesses,
          authContext: await resolveWorkspaceHarnessAuthContext(
            ctx.services.workspaceMembershipsService,
            workspaceId as WorkspaceId,
          ),
        });
        if (validationError !== null) {
          return badUserInput(validationError);
        }
        const agentConfig =
          body.agentConfig === undefined
            ? undefined
            : body.agentConfig === null
              ? null
              : {
                  harnessId: body.agentConfig.harnessId,
                  modelId: body.agentConfig.modelId,
                };
        const workspace = await ctx.services.workspacesService.updateWorkspace(
          workspaceId as WorkspaceId,
          {
            name: body.name,
            agentConfig,
          },
        );
        if (workspace === undefined) {
          return notFound();
        }
        return ok(workspace);
      });
    },
    "sandbox-type": workspaceSandboxTypeHandlers,
    harnesses: {
      GET: async (ctx) => {
        const { workspaceId } = ctx.hono.req.param();
        const authSession = await requireAuthSession(ctx.hono.req.raw);
        if (authSession === null) {
          return unauthenticated();
        }
        return withNewTransaction(ctx.services.db, async () => {
          const canAccess =
            await ctx.services.workspaceMembershipsService.isWorkspaceMember(
              authSession.user.id,
              workspaceId as WorkspaceId,
            );
          if (!canAccess) {
            return notFound();
          }
          const workspace = await ctx.services.workspacesService.getWorkspace(
            workspaceId as WorkspaceId,
          );
          if (workspace === undefined) {
            return notFound();
          }
          const authContext = await resolveWorkspaceHarnessAuthContext(
            ctx.services.workspaceMembershipsService,
            workspaceId as WorkspaceId,
          );
          const harnesses = await Promise.all(
            ctx.services.harnesses.map(async (h) => ({
              id: h.id,
              displayName: h.displayName,
              isAvailable: (
                await ctx.services.harnessAuthService.getAvailability(
                  h.id,
                  authContext,
                )
              ).isAvailable,
              models: h.models.map((m) => ({
                id: m.id,
                displayName: m.displayName,
              })),
            })),
          );
          return ok({ harnesses });
        });
      },
    },
    projects: projectsHandlers,
  },
};
