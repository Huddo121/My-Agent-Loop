import {
  type MyAgentLoopApi,
  notFound,
  ok,
  type ProjectId,
  type TaskId,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

export const tasksHandlers: HonoHandlersFor<
  ["projects", ":projectId", "tasks"],
  MyAgentLoopApi["projects"]["children"][":projectId"]["children"]["tasks"],
  Services
> = {
  GET: async (ctx) => {
    const { projectId } = ctx.hono.req.param();
    return withNewTransaction(ctx.services.db, async () => {
      const tasks = await ctx.services.taskQueue.getAllTasks(
        projectId as ProjectId,
      );
      return ok(tasks);
    });
  },

  POST: async (ctx) => {
    const { projectId } = ctx.hono.req.param();
    return withNewTransaction(ctx.services.db, async () => {
      const tasks = await ctx.services.taskQueue.addTask(
        projectId as ProjectId,
        ctx.body,
      );
      return ok(tasks);
    });
  },

  ":taskId": {
    GET: async (ctx) => {
      const { taskId } = ctx.hono.req.param();

      const foundTask = await withNewTransaction(ctx.services.db, () =>
        ctx.services.taskQueue.getTask(taskId as TaskId),
      );

      if (!foundTask) {
        return notFound();
      }

      return [200, foundTask];
    },

    PUT: async (ctx) => {
      const { taskId } = ctx.hono.req.param();

      const updatedTask = await withNewTransaction(ctx.services.db, () =>
        ctx.services.taskQueue.updateTask(taskId as TaskId, ctx.body),
      );

      if (!updatedTask) {
        return notFound();
      }

      return ok(updatedTask);
    },

    complete: async (ctx) => {
      const { taskId } = ctx.hono.req.param();

      const completedTask = await withNewTransaction(ctx.services.db, () =>
        ctx.services.taskQueue.completeTask(taskId as TaskId),
      );

      if (!completedTask) {
        return notFound();
      }

      return [200, completedTask];
    },
    move: async (ctx) => {
      const { projectId, taskId } = ctx.hono.req.param();

      const movedTask = await withNewTransaction(ctx.services.db, () =>
        ctx.services.taskQueue.moveTask(taskId as TaskId, ctx.body),
      );

      if (!movedTask) {
        console.warn("Can not move task, task not found or already completed", {
          projectId,
          taskId,
        });
        return notFound();
      }

      return ok(movedTask);
    },
  },
};
