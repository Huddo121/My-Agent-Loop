import {
  createSubtaskId,
  type ProjectId,
  projectIdSchema,
  type Subtask,
  subtaskSchema,
  type TaskId,
} from "@mono/api";
import z from "zod";
import type { Task } from "../task-queue";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTool, McpTools } from "../utils/mcp-tool";
import type { Result } from "../utils/Result";
import { withNewTransaction } from "../utils/transaction-context";
import { toTaskDto } from "./tasks-handlers";

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
        subtasks: task.subtasks,
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
      const task = taskResult.value;
      const projectId = await services.taskQueue.getProjectIdForTask(task.id);
      if (projectId) {
        const project = await services.projectsService.getProject(projectId);
        if (project) {
          const config =
            await services.agentHarnessConfigRepository.getTaskConfig(task.id);
          const dto = toTaskDto(task, config);
          await services.liveEventsService.publish(project.workspaceId, {
            type: "task.updated",
            projectId,
            task: dto,
          });
        }
      }
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

    const project = await services.projectsService.getProject(
      params.projectId as ProjectId,
    );
    if (project) {
      const config = await services.agentHarnessConfigRepository.getTaskConfig(
        task.id,
      );
      const dto = toTaskDto(task, config);
      await services.liveEventsService.publish(project.workspaceId, {
        type: "task.updated",
        projectId: params.projectId as ProjectId,
        task: dto,
      });
    }

    console.info("Handled Add Task MCP", { projectId: params.projectId, task });

    return JSON.stringify(task);
  },
} as const satisfies McpTool<typeof addTaskSchema>;

const createSubtaskSchema = z.object({
  taskId: z.string().describe("The ID of the task to add a subtask to"),
  title: z.string().describe("The title of the subtask"),
  description: z
    .string()
    .optional()
    .describe("Optional description of the subtask"),
});

export const createSubtaskMcpHandler = {
  name: "Create subtask",
  description:
    "Add a new subtask to a task. The subtask is appended to the end of the task's subtask list with state 'pending'.",
  parameters: createSubtaskSchema,
  execute: async (params) => {
    const services = getMcpServices();
    return withNewTransaction(services.db, async () => {
      const task = await services.taskQueue.getTask(params.taskId as TaskId);
      if (!task) {
        return JSON.stringify({
          result: "error",
          reason: `Task with id ${params.taskId} not found`,
        });
      }

      const newSubtask: Subtask = {
        id: createSubtaskId(),
        title: params.title,
        description: params.description,
        state: "pending",
      };

      const updatedSubtasks = [...task.subtasks, newSubtask];
      const updatedTask = await services.taskQueue.updateTask(task.id, {
        title: task.title,
        description: task.description,
        subtasks: updatedSubtasks,
      });

      if (updatedTask) {
        const projectId = await services.taskQueue.getProjectIdForTask(task.id);
        if (projectId) {
          const project = await services.projectsService.getProject(projectId);
          if (project) {
            const config =
              await services.agentHarnessConfigRepository.getTaskConfig(
                updatedTask.id,
              );
            const dto = toTaskDto(updatedTask, config);
            await services.liveEventsService.publish(project.workspaceId, {
              type: "task.updated",
              projectId,
              task: dto,
            });
          }
        }
      }

      return JSON.stringify(newSubtask);
    });
  },
} as const satisfies McpTool<typeof createSubtaskSchema>;

const updateSubtaskSchema = z.object({
  taskId: z.string().describe("The ID of the task containing the subtask"),
  subtask: subtaskSchema.describe(
    "The complete subtask object to replace with",
  ),
});

export const updateSubtaskMcpHandler = {
  name: "Update subtask",
  description:
    "Update a subtask with the provided object. Find the subtask in the task by ID and replace it with the provided subtask object. Returns an error if the task or subtask is not found.",
  parameters: updateSubtaskSchema,
  execute: async (params) => {
    const services = getMcpServices();
    return withNewTransaction(services.db, async () => {
      const task = await services.taskQueue.getTask(params.taskId as TaskId);
      if (!task) {
        return JSON.stringify({
          result: "error",
          reason: `Task with id ${params.taskId} not found`,
        });
      }

      const subtaskIndex = task.subtasks.findIndex(
        (s) => s.id === params.subtask.id,
      );
      if (subtaskIndex === -1) {
        return JSON.stringify({
          result: "error",
          reason: `Subtask with id ${params.subtask.id} not found in task ${params.taskId}`,
        });
      }

      const updatedSubtasks = [...task.subtasks];
      updatedSubtasks[subtaskIndex] = params.subtask;

      const updatedTask = await services.taskQueue.updateTask(task.id, {
        title: task.title,
        description: task.description,
        subtasks: updatedSubtasks,
      });

      if (updatedTask) {
        const projectId = await services.taskQueue.getProjectIdForTask(task.id);
        if (projectId) {
          const project = await services.projectsService.getProject(projectId);
          if (project) {
            const config =
              await services.agentHarnessConfigRepository.getTaskConfig(
                updatedTask.id,
              );
            const dto = toTaskDto(updatedTask, config);
            await services.liveEventsService.publish(project.workspaceId, {
              type: "task.updated",
              projectId,
              task: dto,
            });
          }
        }
      }

      return JSON.stringify(params.subtask);
    });
  },
} as const satisfies McpTool<typeof updateSubtaskSchema>;

export const tasksMcpTools = [
  getTasksMcpHandler,
  markTaskCompletedHandler,
  addTaskMcpHandler,
  createSubtaskMcpHandler,
  updateSubtaskMcpHandler,
] as McpTools;
