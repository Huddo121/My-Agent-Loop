import {
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  unauthenticated,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireAuthSession } from "../auth/session";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

type ProjectSandboxTypeApi =
  MyAgentLoopApi["workspaces"]["children"][":workspaceId"]["children"]["projects"]["children"][":projectId"]["children"]["sandbox-type"];

export const projectSandboxTypeHandlers: HonoHandlersFor<
  ["workspaces", ":workspaceId", "projects", ":projectId", "sandbox-type"],
  ProjectSandboxTypeApi,
  Services
> = {
  GET: async (ctx) => {
    const { workspaceId, projectId } = ctx.hono.req.param();
    const authSession = await requireAuthSession(ctx.hono.req.raw);
    if (authSession === null) {
      return unauthenticated();
    }
    return withNewTransaction(ctx.services.db, async () => {
      const canAccess =
        await ctx.services.workspaceMembershipsService.canAccessProject(
          authSession.user.id,
          workspaceId as WorkspaceId,
          projectId as ProjectId,
        );
      if (!canAccess) {
        return notFound();
      }
      const sandboxType =
        await ctx.services.sandboxTypeConfigRepository.getProjectConfig(
          projectId as ProjectId,
        );
      return ok({ sandboxType });
    });
  },
  PUT: async (ctx) => {
    const { workspaceId, projectId } = ctx.hono.req.param();
    const authSession = await requireAuthSession(ctx.hono.req.raw);
    if (authSession === null) {
      return unauthenticated();
    }
    return withNewTransaction(ctx.services.db, async () => {
      const canAccess =
        await ctx.services.workspaceMembershipsService.canAccessProject(
          authSession.user.id,
          workspaceId as WorkspaceId,
          projectId as ProjectId,
        );
      if (!canAccess) {
        return notFound();
      }
      const { sandboxType } = ctx.body;
      await ctx.services.sandboxTypeConfigRepository.setProjectConfig(
        projectId as ProjectId,
        sandboxType,
      );
      console.info("Updated project sandbox type", { projectId, sandboxType });
      return ok({ sandboxType });
    });
  },
};
