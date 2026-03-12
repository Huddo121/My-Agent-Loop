import type { AgentConfig, TaskDto } from "@mono/api";
import {
  badUserInput,
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  type TaskId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { validateAgentConfig } from "../harness";
import type { ScopedHarnessConfig } from "../harness/AgentHarnessConfigRepository";
import type { Services } from "../services";
import type { Task } from "../task-queue/TaskQueue";
import { withNewTransaction } from "../utils/transaction-context";

type WorkspaceProjectsTasksApi =
  MyAgentLoopApi["workspaces"]["children"][":workspaceId"]["children"]["projects"]["children"][":projectId"]["children"]["tasks"];

function toTaskDto(task: Task, config: ScopedHarnessConfig | null): TaskDto {
  const agentConfig: AgentConfig | null = config
    ? { harnessId: config.harnessId, modelId: config.modelId }
    : null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    completedOn: task.completedOn,
    position: task.position ?? null,
    agentConfig,
    subtasks: task.subtasks,
  };
}

export const tasksHandlers: HonoHandlersFor<
  ["workspaces", ":workspaceId", "projects", ":projectId", "tasks"],
  WorkspaceProjectsTasksApi,
  Services
> = {
  GET: async (ctx) => {
    const { projectId } = ctx.hono.req.param();
    return withNewTransaction(ctx.services.db, async () => {
      const tasks = await ctx.services.taskQueue.getAllTasks(
        projectId as ProjectId,
      );
      const taskIds = tasks.map((t) => t.id);
      const harnessConfigs =
        await ctx.services.agentHarnessConfigRepository.getTaskConfigs(taskIds);
      const dtos = tasks.map((t) =>
        toTaskDto(t, harnessConfigs.get(t.id) ?? null),
      );
      return ok(dtos);
    });
  },

  POST: async (ctx) => {
    const { projectId } = ctx.hono.req.param();
    const validationError = validateAgentConfig(ctx.body.agentConfig, {
      harnessAuthService: ctx.services.harnessAuthService,
      harnesses: ctx.services.harnesses,
    });
    if (validationError !== null) {
      return badUserInput(validationError);
    }
    return withNewTransaction(ctx.services.db, async () => {
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
        return ok(toTaskDto(task, config));
      }
      return ok(toTaskDto(task, null));
    });
  },

  ":taskId": {
    GET: async (ctx) => {
      const { taskId } = ctx.hono.req.param();

      return withNewTransaction(ctx.services.db, async () => {
        const task = await ctx.services.taskQueue.getTask(taskId as TaskId);
        if (!task) {
          return notFound();
        }
        const agentHarnessId =
          await ctx.services.agentHarnessConfigRepository.getTaskConfig(
            task.id,
          );
        return ok(toTaskDto(task, agentHarnessId));
      });
    },

    PUT: async (ctx) => {
      const { taskId } = ctx.hono.req.param();
      const validationError = validateAgentConfig(ctx.body.agentConfig, {
        harnessAuthService: ctx.services.harnessAuthService,
        harnesses: ctx.services.harnesses,
      });
      if (validationError !== null) {
        return badUserInput(validationError);
      }
      return withNewTransaction(ctx.services.db, async () => {
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
        return ok(toTaskDto(task, config));
      });
    },

    complete: async (ctx) => {
      const { taskId } = ctx.hono.req.param();

      return withNewTransaction(ctx.services.db, async () => {
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
        return ok(toTaskDto(completedTask, config));
      });
    },

    move: async (ctx) => {
      const { taskId } = ctx.hono.req.param();

      return withNewTransaction(ctx.services.db, async () => {
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
        return ok(toTaskDto(movedTask, config));
      });
    },
  },
};
