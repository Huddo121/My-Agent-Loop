import {
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  runIdSchema,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor, ResponsesForEndpoint } from "cerato";
import { match } from "ts-pattern";
import {
  createGitForgeService,
  defaultForgeBaseUrl,
  getProjectPathFromRepositoryUrl,
} from "../forge";
import type { Services } from "../services";
import { tasksHandlers } from "../tasks/tasks-handlers";
import { ProtectedString } from "../utils/ProtectedString";
import { withNewTransaction } from "../utils/transaction-context";

type WorkspaceProjectsApi =
  MyAgentLoopApi["workspaces"]["children"][":workspaceId"]["children"]["projects"];

export const projectsHandlers: HonoHandlersFor<
  ["workspaces", ":workspaceId", "projects"],
  WorkspaceProjectsApi,
  Services
> = {
  GET: async (ctx) => {
    const { workspaceId } = ctx.hono.req.param();
    return withNewTransaction(ctx.services.db, async () => {
      const projects = await ctx.services.projectsService.getAllProjects(
        workspaceId as WorkspaceId,
      );
      const withHasForgeToken = await Promise.all(
        projects.map(async (p) => ({
          ...p,
          hasForgeToken:
            await ctx.services.forgeSecretRepository.hasForgeSecret(p.id),
        })),
      );
      return ok(withHasForgeToken);
    });
  },
  POST: async (ctx) => {
    const { workspaceId } = ctx.hono.req.param();
    return withNewTransaction(ctx.services.db, async () => {
      const forgeType = ctx.body.forgeType;
      const forgeBaseUrl =
        ctx.body.forgeBaseUrl ?? defaultForgeBaseUrl(forgeType);

      const project = await ctx.services.projectsService.createProject({
        workspaceId: workspaceId as WorkspaceId,
        name: ctx.body.name,
        shortCode: ctx.body.shortCode,
        repositoryUrl: ctx.body.repositoryUrl,
        workflowConfiguration: ctx.body.workflowConfiguration,
        forgeType,
        forgeBaseUrl,
      });
      await ctx.services.forgeSecretRepository.upsertForgeSecret(
        project.id,
        ctx.body.forgeToken,
      );
      const hasForgeToken = true;
      return ok({
        ...project,
        hasForgeToken,
      });
    });
  },
  "test-forge-connection": async (ctx) => {
    const { forgeType, forgeBaseUrl, forgeToken, repositoryUrl } = ctx.body;
    const projectPath = getProjectPathFromRepositoryUrl(repositoryUrl);
    const credential = {
      forgeType,
      forgeBaseUrl,
      token: new ProtectedString(forgeToken),
      projectPath,
    };
    const gitForgeService = createGitForgeService(credential);
    const result = await gitForgeService.testConnection();
    if (result.success) {
      return ok({ success: true as const });
    }
    return [
      400,
      { success: false as const, error: result.error.message },
    ] as const;
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
        const hasForgeToken =
          await ctx.services.forgeSecretRepository.hasForgeSecret(
            projectId as ProjectId,
          );
        return ok({
          ...project,
          hasForgeToken,
        });
      });
    },
    PATCH: async (ctx) => {
      const { projectId } = ctx.hono.req.param();
      return withNewTransaction(ctx.services.db, async () => {
        const updatePayload: Parameters<
          typeof ctx.services.projectsService.updateProject
        >[1] = {};
        if (ctx.body.name !== undefined) updatePayload.name = ctx.body.name;
        if (ctx.body.shortCode !== undefined)
          updatePayload.shortCode = ctx.body.shortCode;
        if (ctx.body.repositoryUrl !== undefined)
          updatePayload.repositoryUrl = ctx.body.repositoryUrl;
        if (ctx.body.workflowConfiguration !== undefined)
          updatePayload.workflowConfiguration = ctx.body.workflowConfiguration;
        if (ctx.body.forgeType !== undefined)
          updatePayload.forgeType = ctx.body.forgeType;
        if (ctx.body.forgeBaseUrl !== undefined)
          updatePayload.forgeBaseUrl = ctx.body.forgeBaseUrl;

        const project = await ctx.services.projectsService.updateProject(
          projectId as ProjectId,
          updatePayload,
        );
        if (project === undefined) {
          return notFound();
        }
        if (ctx.body.forgeToken !== undefined) {
          await ctx.services.forgeSecretRepository.upsertForgeSecret(
            projectId as ProjectId,
            ctx.body.forgeToken,
          );
        }
        const hasForgeToken =
          await ctx.services.forgeSecretRepository.hasForgeSecret(
            projectId as ProjectId,
          );
        return ok({ ...project, hasForgeToken });
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
        // hasForgeSecret may still be true if no CASCADE; we report pre-delete state for consistency
        const hadForgeToken =
          await ctx.services.forgeSecretRepository.hasForgeSecret(
            projectId as ProjectId,
          );
        return ok({ ...project, hasForgeToken: hadForgeToken });
      });
    },
    tasks: tasksHandlers,
    "test-forge-connection": async (ctx) => {
      const { projectId } = ctx.hono.req.param();
      return withNewTransaction(ctx.services.db, async () => {
        const project = await ctx.services.projectsService.getProject(
          projectId as ProjectId,
        );
        if (project === undefined) {
          return notFound();
        }
        const secret = await ctx.services.forgeSecretRepository.getForgeSecret(
          projectId as ProjectId,
        );
        if (secret === undefined) {
          return [
            400,
            {
              success: false as const,
              error: "No forge token configured for this project.",
            },
          ];
        }
        const projectPath = getProjectPathFromRepositoryUrl(
          project.repositoryUrl,
        );
        const gitForgeService = createGitForgeService({
          forgeType: project.forgeType,
          forgeBaseUrl: project.forgeBaseUrl,
          token: secret,
          projectPath,
        });
        const result = await gitForgeService.testConnection();
        if (result.success) {
          return ok({ success: true as const });
        }
        return [400, { success: false as const, error: result.error.message }];
      });
    },
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

        const isReviewWorkflow =
          project.workflowConfiguration.onTaskCompleted === "push-branch" ||
          project.workflowConfiguration.onTaskCompleted ===
            "push-branch-and-create-mr";
        if (isReviewWorkflow && mode === "loop") {
          console.warn(
            "Can not start workflow because the project is configured to use a review workflow",
            { projectId },
          );
          return [400, { reason: "cannot-loop-with-review-workflow" }] as const;
        }

        const workflowResult = await ctx.services.workflowManager.startWorkflow(
          project.id,
          mode,
        );

        if (workflowResult.success === false) {
          return match(workflowResult.error)
            .returnType<
              ResponsesForEndpoint<
                WorkspaceProjectsApi["children"][":projectId"]["children"]["run"]
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
              return [
                400,
                { reason: "project-already-processing-tasks" },
              ] as const;
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

        const hasForgeToken =
          await ctx.services.forgeSecretRepository.hasForgeSecret(
            projectId as ProjectId,
          );

        return ok({
          runId: runIdSchema.parse(workflowResult.value),
          project: { ...updatedProject, hasForgeToken },
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

        const hasForgeToken =
          await ctx.services.forgeSecretRepository.hasForgeSecret(
            projectId as ProjectId,
          );

        return ok({ project: { ...updatedProject, hasForgeToken } });
      });
    },
  },
};
