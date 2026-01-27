import { projectIdSchema, type TaskId } from "@mono/api";
import z from "zod";
import type { Task } from "../task-queue";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTool, McpTools } from "../utils/mcp-tool";
import type { Result } from "../utils/Result";
import { withNewTransaction } from "../utils/transaction-context";

const getTasksSchema = z.object({
  projectId: projectIdSchema.describe("The ID of the project to get tasks for"),
  includeCompleted: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include completed tasks"),
});

export const getTasksMcpHandler = {
  name: "Get tasks",
  description:
    "Retrieve tasks for the queue for inspection. This does not affect the queue, it's a read-only operation.",
  parameters: getTasksSchema,
  execute: async (params) => {
    const services = getMcpServices();

    const tasksResult = await withNewTransaction(
      services.db,
      async (): Promise<Result<Task[], { reason: "cannot-find-project" }>> => {
        const project = await services.projectsService.getProject(
          params.projectId,
        );

        if (project === undefined) {
          return { success: false, error: { reason: "cannot-find-project" } };
        }

        const tasks = await services.taskQueue.getAllTasks(params.projectId, {
          includeCompleted: params.includeCompleted,
        });

        return { success: true, value: tasks };
      },
    );

    if (tasksResult.success === true) {
      const tasks = tasksResult.value;

      const response = tasks.map((task) => ({
        id: task.id,
        description: task.description,
        title: task.title,
        completedOn: task.completedOn?.toISOString(),
      }));

      console.info("Handled Get Tasks MCP", {
        success: true,
        params,
        returnedItemCount: response.length,
      });

      return JSON.stringify(response);
    } else {
      console.info("Handled Get Tasks MCP", {
        success: false,
        params,
        reason: tasksResult.error.reason,
      });

      return JSON.stringify({
        result: "error",
        reason: tasksResult.error.reason,
      });
    }
  },
} as const satisfies McpTool<typeof getTasksSchema>;

const markTaskCompletedSchema = z.object({
  id: z.string().describe("The ID of the task to update"),
});

export const markTaskCompletedHandler = {
  name: "Mark task completed",
  description:
    "Mark a task as completed. This is only necessary if you wish to mark a task other than the one you're currently working on as completed (e.g. you solved another task incidentally). Only backlog grooming agents should use this tool, not coding agents.",
  parameters: markTaskCompletedSchema,
  execute: async (params, _ctx) => {
    const services = getMcpServices();

    const taskResult = await withNewTransaction(
      services.db,
      async (): Promise<Result<Task, { reason: "cannot-find-task" }>> => {
        const task = await services.taskQueue.completeTask(params.id as TaskId);
        if (task === undefined) {
          return { success: false, error: { reason: "cannot-find-task" } };
        }
        return { success: true, value: task };
      },
    );

    if (taskResult.success === true) {
      console.info("Handled Update Task MCP", {
        params,
        task: taskResult.value,
      });
      return JSON.stringify(taskResult.value);
    } else {
      console.info("Handled Update Task MCP", {
        result: "error",
        params,
        reason: taskResult.error.reason,
      });
      return JSON.stringify({
        result: "error",
        reason: `Task with id ${params.id} not found`,
      });
    }
  },
} as const satisfies McpTool<typeof markTaskCompletedSchema>;

const addTaskSchema = z.object({
  projectId: projectIdSchema.describe(
    "The ID of the project to assign the task to",
  ),
  task: z.object({
    title: z.string().describe("The title of the task"),
    description: z.string().describe("The description of the task"),
    projectId: z
      .string()
      .describe("The ID of the project to assign the task to"),
  }),
});

export const addTaskMcpHandler = {
  name: "Add task",
  description:
    "Add a new task to the queue. If you spot something that should be done eventually, but is not a part of your current task, add it to the queue and a backlog grooming agent will evaluate it later.",
  parameters: addTaskSchema,
  execute: async (params) => {
    const services = getMcpServices();
    // TODO: Technically this could fail because the Project doesn't exist
    const task = await withNewTransaction(
      services.db,
      async () =>
        await services.taskQueue.addTask(params.projectId, params.task),
    );

    console.info("Handled Add Task MCP", { projectId: params.projectId, task });

    return JSON.stringify(task);
  },
} as const satisfies McpTool<typeof addTaskSchema>;

export const tasksMcpTools = [
  getTasksMcpHandler,
  markTaskCompletedHandler,
  addTaskMcpHandler,
] as McpTools;
