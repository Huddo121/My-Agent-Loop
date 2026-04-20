import type { AgentConfig, TaskDto } from "@mono/api";
import {
  badUserInput,
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  type TaskId,
  unauthenticated,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireAuthSession } from "../auth/session";
import type { Database } from "../db";
import { validateAgentConfig } from "../harness";
import type { ScopedHarnessConfig } from "../harness/AgentHarnessConfigRepository";
import type { Services } from "../services";
import type { Task } from "../task-queue/TaskQueue";
import { withNewTransaction } from "../utils/transaction-context";

type WorkspaceProjectsTasksApi =
  MyAgentLoopApi["workspaces"]["children"][":workspaceId"]["children"]["projects"]["children"][":projectId"]["children"]["tasks"];

export type ActiveRunFromDb = "pending" | "in_progress" | null;

function resolveActiveRunState(
  task: Task,
  activeFromDb: ActiveRunFromDb,
): ActiveRunFromDb {
  if (task.completedOn != null) {
    return null;
  }
  return activeFromDb;
}

export function toTaskDto(
  task: Task,
  config: ScopedHarnessConfig | null,
  activeRunFromDb: ActiveRunFromDb = null,
): TaskDto {
  const agentConfig: AgentConfig | null = config
    ? { harnessId: config.harnessId, modelId: config.modelId }
    : null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    completedOn: task.completedOn,
    position: task.position ?? null,
    activeRunState: resolveActiveRunState(task, activeRunFromDb),
    agentConfig,
    subtasks: task.subtasks,
  };
}

/**
 * Loads task + harness config + active run row and publishes `task.updated`.
 * Starts its own transaction (for callers outside an existing transaction).
 */
export async function publishTaskUpdatedForTask(
  db: Database,
  deps: Pick<
    Services,
    | "taskQueue"
    | "agentHarnessConfigRepository"
    | "runsService"
    | "projectsService"
    | "liveEventsService"
  >,
  taskId: TaskId,
): Promise<void> {
  await withNewTransaction(db, async () => {
    const task = await deps.taskQueue.getTask(taskId);
    if (task === undefined) {
      return;
    }
    const projectId = await deps.taskQueue.getProjectIdForTask(taskId);
    if (projectId === undefined) {
      return;
    }
    const project = await deps.projectsService.getProject(projectId);
    if (project === undefined) {
      return;
    }
    const config =
      await deps.agentHarnessConfigRepository.getTaskConfig(taskId);
    const activeMap = await deps.runsService.getActiveRunStatesForTasks([
      taskId,
    ]);
    const dto = toTaskDto(task, config, activeMap.get(taskId) ?? null);
    await deps.liveEventsService.publish(project.workspaceId, {
      type: "task.updated",
      projectId,
      task: dto,
    });
  });
}

export const tasksHandlers: HonoHandlersFor<
  ["workspaces", ":workspaceId", "projects", ":projectId", "tasks"],
  WorkspaceProjectsTasksApi,
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
      const tasks = await ctx.services.taskQueue.getAllTasks(
        projectId as ProjectId,
      );
      const taskIds = tasks.map((t) => t.id);
      const harnessConfigs =
        await ctx.services.agentHarnessConfigRepository.getTaskConfigs(taskIds);
      const activeRuns =
        await ctx.services.runsService.getActiveRunStatesForTasks(taskIds);
      const dtos = tasks.map((t) =>
        toTaskDto(
          t,
          harnessConfigs.get(t.id) ?? null,
          activeRuns.get(t.id) ?? null,
        ),
      );
      return ok(dtos);
    });
  },

  POST: async (ctx) => {
    const { workspaceId, projectId } = ctx.hono.req.param();
    const authSession = await requireAuthSession(ctx.hono.req.raw);
    if (authSession === null) {
      return unauthenticated();
    }
    const validationError = validateAgentConfig(ctx.body.agentConfig, {
      harnessAuthService: ctx.services.harnessAuthService,
      harnesses: ctx.services.harnesses,
    });
    if (validationError !== null) {
      return badUserInput(validationError);
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
      const task = await ctx.services.taskQueue.addTask(
        projectId as ProjectId,
        {
          title: ctx.body.title,
          description: ctx.body.description,
          subtasks: ctx.body.subtasks ?? [],
        },
      );
      if (ctx.body.agentConfig !== null && ctx.body.agentConfig !== undefined) {
        const config: ScopedHarnessConfig = {
          harnessId: ctx.body.agentConfig.harnessId,
          modelId: ctx.body.agentConfig.modelId,
        };
        await ctx.services.agentHarnessConfigRepository.setTaskConfig(
          task.id,
          config,
        );
        const dto = toTaskDto(task, config, null);
        await ctx.services.liveEventsService.publish(
          workspaceId as WorkspaceId,
          {
            type: "task.updated",
            projectId: projectId as ProjectId,
            task: dto,
          },
        );
        return ok(dto);
      }
      const dto = toTaskDto(task, null, null);
      await ctx.services.liveEventsService.publish(workspaceId as WorkspaceId, {
        type: "task.updated",
        projectId: projectId as ProjectId,
        task: dto,
      });
      return ok(dto);
    });
  },

  ":taskId": {
    GET: async (ctx) => {
      const { workspaceId, projectId, taskId } = ctx.hono.req.param();
      const authSession = await requireAuthSession(ctx.hono.req.raw);
      if (authSession === null) {
        return unauthenticated();
      }

      return withNewTransaction(ctx.services.db, async () => {
        const canAccess =
          await ctx.services.workspaceMembershipsService.canAccessTask(
            authSession.user.id,
            workspaceId as WorkspaceId,
            projectId as ProjectId,
            taskId as TaskId,
          );
        if (!canAccess) {
          return notFound();
        }
        const task = await ctx.services.taskQueue.getTask(taskId as TaskId);
        if (!task) {
          return notFound();
        }
        const agentHarnessId =
          await ctx.services.agentHarnessConfigRepository.getTaskConfig(
            task.id,
          );
        const activeRuns =
          await ctx.services.runsService.getActiveRunStatesForTasks([task.id]);
        return ok(
          toTaskDto(task, agentHarnessId, activeRuns.get(task.id) ?? null),
        );
      });
    },

    PUT: async (ctx) => {
      const { workspaceId, projectId, taskId } = ctx.hono.req.param();
      const authSession = await requireAuthSession(ctx.hono.req.raw);
      if (authSession === null) {
        return unauthenticated();
      }
      const validationError = validateAgentConfig(ctx.body.agentConfig, {
        harnessAuthService: ctx.services.harnessAuthService,
        harnesses: ctx.services.harnesses,
      });
      if (validationError !== null) {
        return badUserInput(validationError);
      }
      return withNewTransaction(ctx.services.db, async () => {
        const canAccess =
          await ctx.services.workspaceMembershipsService.canAccessTask(
            authSession.user.id,
            workspaceId as WorkspaceId,
            projectId as ProjectId,
            taskId as TaskId,
          );
        if (!canAccess) {
          return notFound();
        }
        const task = await ctx.services.taskQueue.updateTask(taskId as TaskId, {
          title: ctx.body.title,
          description: ctx.body.description,
          ...(ctx.body.subtasks !== undefined && {
            subtasks: ctx.body.subtasks,
          }),
        });
        if (!task) {
          return notFound();
        }
        let config: ScopedHarnessConfig | null;
        if (ctx.body.agentConfig === undefined) {
          config =
            await ctx.services.agentHarnessConfigRepository.getTaskConfig(
              task.id,
            );
        } else if (ctx.body.agentConfig === null) {
          config = null;
        } else {
          config = {
            harnessId: ctx.body.agentConfig.harnessId,
            modelId: ctx.body.agentConfig.modelId,
          };
        }
        if (ctx.body.agentConfig !== undefined) {
          await ctx.services.agentHarnessConfigRepository.setTaskConfig(
            task.id,
            config,
          );
        }
        const activeRuns =
          await ctx.services.runsService.getActiveRunStatesForTasks([task.id]);
        const dto = toTaskDto(task, config, activeRuns.get(task.id) ?? null);
        await ctx.services.liveEventsService.publish(
          workspaceId as WorkspaceId,
          {
            type: "task.updated",
            projectId: projectId as ProjectId,
            task: dto,
          },
        );
        return ok(dto);
      });
    },

    complete: async (ctx) => {
      const { workspaceId, projectId, taskId } = ctx.hono.req.param();
      const authSession = await requireAuthSession(ctx.hono.req.raw);
      if (authSession === null) {
        return unauthenticated();
      }

      return withNewTransaction(ctx.services.db, async () => {
        const canAccess =
          await ctx.services.workspaceMembershipsService.canAccessTask(
            authSession.user.id,
            workspaceId as WorkspaceId,
            projectId as ProjectId,
            taskId as TaskId,
          );
        if (!canAccess) {
          return notFound();
        }
        const completedTask = await ctx.services.taskQueue.completeTask(
          taskId as TaskId,
        );
        if (!completedTask) {
          return notFound();
        }
        const config =
          await ctx.services.agentHarnessConfigRepository.getTaskConfig(
            completedTask.id,
          );
        const dto = toTaskDto(completedTask, config, null);
        await ctx.services.liveEventsService.publish(
          workspaceId as WorkspaceId,
          {
            type: "task.updated",
            projectId: projectId as ProjectId,
            task: dto,
          },
        );
        return ok(dto);
      });
    },

    move: async (ctx) => {
      const { workspaceId, projectId, taskId } = ctx.hono.req.param();
      const authSession = await requireAuthSession(ctx.hono.req.raw);
      if (authSession === null) {
        return unauthenticated();
      }

      return withNewTransaction(ctx.services.db, async () => {
        const canAccess =
          await ctx.services.workspaceMembershipsService.canAccessTask(
            authSession.user.id,
            workspaceId as WorkspaceId,
            projectId as ProjectId,
            taskId as TaskId,
          );
        if (!canAccess) {
          return notFound();
        }
        const movedTask = await ctx.services.taskQueue.moveTask(
          taskId as TaskId,
          ctx.body,
        );
        if (!movedTask) {
          console.warn(
            "Can not move task, task not found or already completed",
            { taskId },
          );
          return notFound();
        }
        const config =
          await ctx.services.agentHarnessConfigRepository.getTaskConfig(
            movedTask.id,
          );
        const activeRuns =
          await ctx.services.runsService.getActiveRunStatesForTasks([
            movedTask.id,
          ]);
        const dto = toTaskDto(
          movedTask,
          config,
          activeRuns.get(movedTask.id) ?? null,
        );
        await ctx.services.liveEventsService.publish(
          workspaceId as WorkspaceId,
          {
            type: "task.updated",
            projectId: projectId as ProjectId,
            task: dto,
          },
        );
        return ok(dto);
      });
    },
  },
};
