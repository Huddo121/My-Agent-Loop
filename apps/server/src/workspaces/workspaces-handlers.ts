import { type MyAgentLoopApi, notFound, ok, type WorkspaceId } from "@mono/api";
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
    projects: projectsHandlers,
  },
};
