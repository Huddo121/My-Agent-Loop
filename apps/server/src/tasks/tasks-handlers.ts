import type { TaskDto } from "@mono/api";
import {
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  type TaskId,
  type WorkspaceId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import type { Services } from "../services";
import type { Task } from "../task-queue/TaskQueue";
import { withNewTransaction } from "../utils/transaction-context";

type WorkspaceProjectsTasksApi =
  MyAgentLoopApi["workspaces"]["children"][":workspaceId"]["children"]["projects"]["children"][":projectId"]["children"]["tasks"];

async function toTaskDto(
  task: Task,
  projectId: ProjectId,
  workspaceId: WorkspaceId,
  services: Services,
): Promise<TaskDto> {
  const agentHarnessId =
    await services.agentHarnessConfigRepository.getTaskConfig(task.id);
  const resolvedAgentHarnessId =
    await services.agentHarnessConfigRepository.resolveHarnessId(
      task.id,
      projectId,
      workspaceId,
    );
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    completedOn: task.completedOn,
    position: task.position ?? null,
    agentHarnessId,
    resolvedAgentHarnessId,
  };
}

export const tasksHandlers: HonoHandlersFor<
  ["workspaces", ":workspaceId", "projects", ":projectId", "tasks"],
  WorkspaceProjectsTasksApi,
  Services
> = {
  GET: async (ctx) => {
    const { projectId, workspaceId } = ctx.hono.req.param();
    return withNewTransaction(ctx.services.db, async () => {
      const tasks = await ctx.services.taskQueue.getAllTasks(
        projectId as ProjectId,
      );
      const dtos = await Promise.all(
        tasks.map((t) =>
          toTaskDto(
            t,
            projectId as ProjectId,
            workspaceId as WorkspaceId,
            ctx.services,
          ),
        ),
      );
      return ok(dtos);
    });
  },

  POST: async (ctx) => {
    const { projectId, workspaceId } = ctx.hono.req.param();
    if (
      ctx.body.agentHarnessId !== undefined &&
      ctx.body.agentHarnessId !== null &&
      !ctx.services.harnessAuthService.isAvailable(ctx.body.agentHarnessId)
    ) {
      return [
        400,
        {
          error: `Agent harness "${ctx.body.agentHarnessId}" is not available (API key not configured).`,
        },
      ] as const;
    }
    return withNewTransaction(ctx.services.db, async () => {
      const task = await ctx.services.taskQueue.addTask(
        projectId as ProjectId,
        { title: ctx.body.title, description: ctx.body.description },
      );
      if (ctx.body.agentHarnessId !== undefined) {
        await ctx.services.agentHarnessConfigRepository.setTaskConfig(
          task.id,
          ctx.body.agentHarnessId,
        );
      }
      const dto = await toTaskDto(
        task,
        projectId as ProjectId,
        workspaceId as WorkspaceId,
        ctx.services,
      );
      return ok(dto);
    });
  },

  ":taskId": {
    GET: async (ctx) => {
      const { projectId, taskId, workspaceId } = ctx.hono.req.param();

      const foundTask = await withNewTransaction(ctx.services.db, () =>
        ctx.services.taskQueue.getTask(taskId as TaskId),
      );

      if (!foundTask) {
        return notFound();
      }

      const dto = await toTaskDto(
        foundTask,
        projectId as ProjectId,
        workspaceId as WorkspaceId,
        ctx.services,
      );
      return ok(dto);
    },

    PUT: async (ctx) => {
      const { projectId, taskId, workspaceId } = ctx.hono.req.param();
      if (
        ctx.body.agentHarnessId !== undefined &&
        ctx.body.agentHarnessId !== null &&
        !ctx.services.harnessAuthService.isAvailable(ctx.body.agentHarnessId)
      ) {
        return [
          400,
          {
            error: `Agent harness "${ctx.body.agentHarnessId}" is not available (API key not configured).`,
          },
        ] as const;
      }
      return withNewTransaction(ctx.services.db, async () => {
        const task = await ctx.services.taskQueue.updateTask(taskId as TaskId, {
          title: ctx.body.title,
          description: ctx.body.description,
        });
        if (!task) {
          return notFound();
        }
        if (ctx.body.agentHarnessId !== undefined) {
          await ctx.services.agentHarnessConfigRepository.setTaskConfig(
            task.id,
            ctx.body.agentHarnessId,
          );
        }
        const dto = await toTaskDto(
          task,
          projectId as ProjectId,
          workspaceId as WorkspaceId,
          ctx.services,
        );
        return ok(dto);
      });
    },

    complete: async (ctx) => {
      const { projectId, taskId, workspaceId } = ctx.hono.req.param();

      return withNewTransaction(ctx.services.db, async () => {
        const completedTask = await ctx.services.taskQueue.completeTask(
          taskId as TaskId,
        );
        if (!completedTask) {
          return notFound();
        }
        const dto = await toTaskDto(
          completedTask,
          projectId as ProjectId,
          workspaceId as WorkspaceId,
          ctx.services,
        );
        return ok(dto);
      });
    },
    move: async (ctx) => {
      const { projectId, taskId, workspaceId } = ctx.hono.req.param();

      return withNewTransaction(ctx.services.db, async () => {
        const movedTask = await ctx.services.taskQueue.moveTask(
          taskId as TaskId,
          ctx.body,
        );
        if (!movedTask) {
          console.warn(
            "Can not move task, task not found or already completed",
            { projectId, taskId },
          );
          return notFound();
        }
        const dto = await toTaskDto(
          movedTask,
          projectId as ProjectId,
          workspaceId as WorkspaceId,
          ctx.services,
        );
        return ok(dto);
      });
    },
  },
};
