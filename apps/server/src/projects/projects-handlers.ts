import {
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  runIdSchema,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { match } from "ts-pattern";
import type { RunId } from "../runs/RunId";
import type { Services } from "../services";
import { tasksHandlers } from "../tasks/tasks-handlers";
import type { Result } from "../utils/Result";
import { withNewTransaction } from "../utils/transaction-context";
import type { BeginWorkflowError } from "../workflow/BackgroundWorkflowProcessor";

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
          repositoryUrl: ctx.body.repositoryUrl,
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
    run: async (ctx) => {
      const { projectId } = ctx.hono.req.param();

      const mode = ctx.body.mode;
      const result = await withNewTransaction(
        ctx.services.db,
        async (): Promise<
          Result<RunId, BeginWorkflowError | { reason: "project-not-found" }>
        > => {
          const project = await ctx.services.projectsService.getProject(
            projectId as ProjectId,
          );

          if (project === undefined) {
            return { success: false, error: { reason: "project-not-found" } };
          }

          return ctx.services.backgroundWorkflowProcessor.queueNextTask(
            project.id,
            mode,
          );
        },
      );

      if (result.success === true) {
        return ok({ runId: runIdSchema.parse(result.value) });
      }

      return match(result.error)
        .with({ reason: "no-tasks-available" }, () => {
          console.warn(
            "Can not start workflow because no tasks are available",
            { projectId },
          );
          return notFound("No tasks are available to process");
        })
        .with({ reason: "project-not-found" }, () => {
          console.warn(
            "Can not start workflow because the project could not found",
            { projectId },
          );
          return notFound("The project could not be found");
        })
        .exhaustive();
    },
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
        repositoryUrl: ctx.body.repositoryUrl,
      });
      return ok(project);
    });
  },
};
