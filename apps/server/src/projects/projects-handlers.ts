import {
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  runIdSchema,
} from "@mono/api";
import type { HonoHandlersFor, ResponsesForEndpoint } from "cerato";
import { match } from "ts-pattern";
import type { Services } from "../services";
import { tasksHandlers } from "../tasks/tasks-handlers";
import { withNewTransaction } from "../utils/transaction-context";

export const projectsHandlers: HonoHandlersFor<
  ["projects"],
  MyAgentLoopApi["projects"],
  Services
> = {
  GET: async (ctx) => {
    return withNewTransaction(ctx.services.db, async () => {
      const projects = await ctx.services.projectsService.getAllProjects();
      return ok(projects);
    });
  },
  POST: async (ctx) => {
    return withNewTransaction(ctx.services.db, async () => {
      const project = await ctx.services.projectsService.createProject({
        name: ctx.body.name,
        shortCode: ctx.body.shortCode,
        repositoryUrl: ctx.body.repositoryUrl,
        workflowConfiguration: ctx.body.workflowConfiguration,
      });
      return ok(project);
    });
  },
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
        const project = await ctx.services.projectsService.updateProject(
          projectId as ProjectId,
          {
            name: ctx.body.name,
            shortCode: ctx.body.shortCode,
            repositoryUrl: ctx.body.repositoryUrl,
            workflowConfiguration: ctx.body.workflowConfiguration,
          },
        );
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
      return await withNewTransaction(ctx.services.db, async () => {
        const project = await ctx.services.projectsService.getProject(
          projectId as ProjectId,
        );

        if (project === undefined) {
          return notFound("The project could not be found");
        }

        if (
          project.workflowConfiguration.onTaskCompleted === "push-branch" &&
          mode === "loop"
        ) {
          console.warn(
            "Can not start workflow because the project is configured to use a review workflow",
            { projectId },
          );
          return [400, { reason: "cannot-loop-with-review-workflow" }] as const;
        }

        const workflowResult =
          await ctx.services.workflowManager.startWorkflow(project.id, mode);

        if (workflowResult.success === false) {
          return match(workflowResult.error)
            .returnType<
              // TODO: Fix this verbose monstrosity in Cerato
              ResponsesForEndpoint<
                MyAgentLoopApi["projects"]["children"][":projectId"]["children"]["run"]
              >
            >()
            .with({ reason: "no-tasks-available" }, () => {
              console.warn(
                "Can not start workflow because no tasks are available",
                { projectId },
              );
              return [400, { reason: "no-tasks-available" }] as const;
            })
            .with({ reason: "project-not-found" }, () => {
              console.warn(
                "Can not start workflow because the project could not be found",
                { projectId },
              );
              return notFound("The project could not be found");
            })
            .with({ reason: "project-already-processing-tasks" }, () => {
              console.warn(
                "Can not start workflow because the project is already processing tasks",
                { projectId },
              );
              return [400, { reason: "project-already-processing-tasks" }] as const;
            })
            .exhaustive();
        }

        // Fetch the updated project within the same transaction
        const updatedProject = await ctx.services.projectsService.getProject(
          projectId as ProjectId,
        );

        if (updatedProject === undefined) {
          return notFound("The project could not be found");
        }

        return ok({
          runId: runIdSchema.parse(workflowResult.value),
          project: updatedProject,
        });
      });
    },
    stop: async (ctx) => {
      const { projectId } = ctx.hono.req.param();
      const stopImmediately = ctx.body.stopImmediately;

      return await withNewTransaction(ctx.services.db, async () => {
        const project = await ctx.services.projectsService.getProject(
          projectId as ProjectId,
        );

        if (project === undefined) {
          return notFound();
        }

        const queueState = project.queueState;
        const isRunningState =
          queueState === "processing-single" ||
          queueState === "processing-loop";

        if (!isRunningState) {
          console.warn(
            "Can not stop queue because it is not in a running state",
            { projectId, queueState },
          );
          return [400, { reason: "queue-not-in-running-state" }] as const;
        }

        // Check if there are any executing runs (pending or in_progress) for this project
        const activeRuns = await ctx.services.runsService.getRunsForProject(
          projectId as ProjectId,
        );

        const hasExecutingRuns = activeRuns.length > 0;
        const newQueueState = hasExecutingRuns ? "stopping" : "idle";

        const updatedProject =
          await ctx.services.projectsService.updateProjectQueueState(
            projectId as ProjectId,
            newQueueState,
          );

        if (updatedProject === undefined) {
          return notFound();
        }

        console.info("Stopped queue", {
          projectId,
          stopImmediately,
          previousQueueState: queueState,
          newQueueState,
          hasExecutingRuns,
        });

        return ok({ project: updatedProject });
      });
    },
  },
};
