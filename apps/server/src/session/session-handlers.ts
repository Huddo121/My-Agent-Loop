import {
  badUserInput,
  type MyAgentLoopApi,
  ok,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireAuthSession } from "../auth/session";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

export const sessionHandlers: HonoHandlersFor<
  ["session"],
  MyAgentLoopApi["session"],
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
      return ok({
        user: authSession.user,
        workspaces,
        needsWorkspaceBootstrap: workspaces.length === 0,
      });
    });
  },
  "bootstrap-workspace": async (ctx) => {
    const authSession = await requireAuthSession(ctx.hono.req.raw);
    if (Array.isArray(authSession)) {
      return authSession;
    }
    return withNewTransaction(ctx.services.db, async () => {
      const alreadyBootstrapped =
        await ctx.services.workspaceMembershipsService.userHasAnyWorkspace(
          authSession.user.id,
        );
      if (alreadyBootstrapped) {
        return badUserInput("Workspace bootstrap has already been completed.");
      }
      const workspace =
        await ctx.services.workspacesService.createWorkspaceForUser(
          authSession.user.id,
          {
            name: ctx.body.name,
          },
        );
      return ok(workspace);
    });
  },
};
