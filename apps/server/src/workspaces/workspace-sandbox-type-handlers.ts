import {
  type MyAgentLoopApi,
  notFound,
  ok,
  unauthenticated,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireAuthSession } from "../auth/session";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

type WorkspaceSandboxTypeApi =
  MyAgentLoopApi["workspaces"]["children"][":workspaceId"]["children"]["sandbox-type"];

export const sandboxTypeHandlers: HonoHandlersFor<
  ["workspaces", ":workspaceId", "sandbox-type"],
  WorkspaceSandboxTypeApi,
  Services
> = {
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
      const sandboxType =
        await ctx.services.sandboxTypeConfigRepository.getWorkspaceConfig(
          workspaceId as WorkspaceId,
        );
      return ok({ sandboxType });
    });
  },
  PUT: async (ctx) => {
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
      const { sandboxType } = ctx.body;
      await ctx.services.sandboxTypeConfigRepository.setWorkspaceConfig(
        workspaceId as WorkspaceId,
        sandboxType,
      );
      ctx.services.logger.info("Updated workspace sandbox type", {
        workspaceId,
        sandboxType,
      });
      return ok({ sandboxType });
    });
  },
};
