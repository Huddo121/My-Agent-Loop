import {
  badUserInput,
  type MyAgentLoopApi,
  notFound,
  ok,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { projectsHandlers } from "../projects/projects-handlers";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

export const workspacesHandlers: HonoHandlersFor<
  ["workspaces"],
  MyAgentLoopApi["workspaces"],
  Services
> = {
  GET: async (ctx) => {
    return withNewTransaction(ctx.services.db, async () => {
      const workspaces =
        await ctx.services.workspacesService.getAllWorkspaces();
      return ok(workspaces);
    });
  },
  POST: async (ctx) => {
    return withNewTransaction(ctx.services.db, async () => {
      const workspace = await ctx.services.workspacesService.createWorkspace({
        name: ctx.body.name,
      });
      return ok(workspace);
    });
  },
  ":workspaceId": {
    GET: async (ctx) => {
      const { workspaceId } = ctx.hono.req.param();
      return withNewTransaction(ctx.services.db, async () => {
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
      const body = ctx.body;
      if (
        body.agentHarnessId !== undefined &&
        body.agentHarnessId !== null &&
        !ctx.services.harnessAuthService.isAvailable(body.agentHarnessId)
      ) {
        return badUserInput(
          `Agent harness "${body.agentHarnessId}" is not available (API key not configured).`,
        );
      }
      return withNewTransaction(ctx.services.db, async () => {
        const workspace = await ctx.services.workspacesService.updateWorkspace(
          workspaceId as WorkspaceId,
          {
            name: body.name,
            agentHarnessId: body.agentHarnessId,
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
        return withNewTransaction(ctx.services.db, async () => {
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
          }));
          return ok({ harnesses });
        });
      },
    },
    projects: projectsHandlers,
  },
};
