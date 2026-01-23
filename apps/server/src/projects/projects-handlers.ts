import { type MyAgentLoopApi, notFound, ok, type ProjectId } from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import type { Services } from "../services";
import { tasksHandlers } from "../tasks/tasks-handlers";
import { withNewTransaction } from "../utils/transaction-context";

export const projectsHandlers: HonoHandlersFor<
  ["projects"],
  MyAgentLoopApi["projects"],
  Services
> = {
  ":projectId": {
    GET: async (ctx) => {
      const { projectId } = ctx.hono.req.param();
      return withNewTransaction(ctx.services.db, async () => {
        const project = await ctx.services.projectsService.getProject(
          projectId as ProjectId,
        );
        if (project === undefined) {
          return notFound();
        }
        return ok(project);
      });
    },
    PATCH: async (ctx) => {
      const { projectId } = ctx.hono.req.param();
      return withNewTransaction(ctx.services.db, async () => {
        const project = await ctx.services.projectsService.updateProject({
          id: projectId as ProjectId,
          name: ctx.body.name,
          shortCode: ctx.body.shortCode,
        });
        if (project === undefined) {
          return notFound();
        }
        return ok(project);
      });
    },
    DELETE: async (ctx) => {
      const { projectId } = ctx.hono.req.param();
      return withNewTransaction(ctx.services.db, async () => {
        const project = await ctx.services.projectsService.deleteProject(
          projectId as ProjectId,
        );
        if (project === undefined) {
          return notFound();
        }
        return ok(project);
      });
    },
    tasks: tasksHandlers,
  },
  GET: async (ctx) => {
    return withNewTransaction(ctx.services.db, async () => {
      const projects = await ctx.services.projectsService.getAllProjects();
      return ok(projects);
    });
  },
  POST: async (ctx) => {
    return withNewTransaction(ctx.services.db, async () => {
      const project = await ctx.services.projectsService.createProject({
        id: crypto.randomUUID() as ProjectId,
        name: ctx.body.name,
        shortCode: ctx.body.shortCode,
      });
      return ok(project);
    });
  },
};
