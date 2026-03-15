import {
  badUserInput,
  type MyAgentLoopApi,
  notFound,
  ok,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireAuthSession } from "../auth/session";
import { validateAgentConfig } from "../harness";
import { projectsHandlers } from "../projects/projects-handlers";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

export const workspacesHandlers: HonoHandlersFor<
  ["workspaces"],
  MyAgentLoopApi["workspaces"],
  Services
> = {
  GET: async (ctx) => {
    const authSession = await requireAuthSession(ctx.hono.req.raw);
    if (Array.isArray(authSession)) {
      return authSession;
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
      if (Array.isArray(authSession)) {
        return authSession;
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
      if (Array.isArray(authSession)) {
        return authSession;
      }
      const body = ctx.body;
      const validationError = validateAgentConfig(body.agentConfig, {
        harnessAuthService: ctx.services.harnessAuthService,
        harnesses: ctx.services.harnesses,
      });
      if (validationError !== null) {
        return badUserInput(validationError);
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
    harnesses: {
      GET: async (ctx) => {
        const { workspaceId } = ctx.hono.req.param();
        const authSession = await requireAuthSession(ctx.hono.req.raw);
        if (Array.isArray(authSession)) {
          return authSession;
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
          const harnesses = ctx.services.harnesses.map((h) => ({
            id: h.id,
            displayName: h.displayName,
            isAvailable: ctx.services.harnessAuthService.isAvailable(h.id),
            models: h.models.map((m) => ({
              id: m.id,
              displayName: m.displayName,
            })),
          }));
          return ok({ harnesses });
        });
      },
    },
    projects: projectsHandlers,
  },
};
