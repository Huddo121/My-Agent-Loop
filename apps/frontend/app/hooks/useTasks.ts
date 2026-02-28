import type {
  MoveTaskRequest,
  ProjectId,
  TaskId,
  WorkspaceId,
} from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import type { NewTask, Task, UpdateTask } from "~/types";

const tasksQueryKey = (projectId: ProjectId | null) =>
  ["tasks", projectId] as const;

/**
 * Hook to fetch tasks for a specific project.
 */
export function useTasks(
  workspaceId: WorkspaceId | null,
  projectId: ProjectId | null,
) {
  return useQuery({
    queryKey: tasksQueryKey(projectId),
    queryFn: async (): Promise<Task[]> => {
      if (workspaceId === null || projectId === null) {
        throw new Error("Workspace ID and Project ID are required");
      }
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks.GET({
        pathParams: { workspaceId, projectId },
      });
      if (response.status === 200) {
        return response.responseBody as Task[];
      }
      throw new Error("Failed to fetch tasks");
    },
    enabled: workspaceId !== null && projectId !== null,
  });
}

/**
 * Hook to create a new task for a project.
 */
export function useCreateTask(
  workspaceId: WorkspaceId | null,
  projectId: ProjectId | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newTask: NewTask): Promise<Task> => {
      if (!workspaceId || !projectId) {
        throw new Error("Workspace and project are required");
      }
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks.POST({
        pathParams: { workspaceId, projectId },
        body: newTask,
      });
      if (response.status === 200) {
        return response.responseBody as Task;
      }
      throw new Error("Failed to create task");
    },
    onSuccess: (newTask) => {
      if (!projectId) return;
      queryClient.setQueryData<Task[]>(tasksQueryKey(projectId), (old) => {
        if (!old) return [newTask];
        return [...old, newTask];
      });
    },
  });
}

/**
 * Hook to mark a task as completed.
 */
export function useCompleteTask(
  workspaceId: WorkspaceId | null,
  projectId: ProjectId | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: TaskId): Promise<Task> => {
      if (!workspaceId || !projectId) {
        throw new Error("Workspace and project are required");
      }
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks[":taskId"].complete.POST({
        pathParams: { workspaceId, projectId, taskId },
      });
      if (response.status === 200) {
        return response.responseBody as Task;
      }
      throw new Error("Failed to complete task");
    },
    onSuccess: (updatedTask) => {
      if (!projectId) return;
      queryClient.setQueryData<Task[]>(tasksQueryKey(projectId), (old) => {
        if (!old) return [updatedTask];
        return old.map((task) =>
          task.id === updatedTask.id ? updatedTask : task,
        );
      });
    },
  });
}

/**
 * Hook to update an existing task.
 */
export function useUpdateTask(
  workspaceId: WorkspaceId | null,
  projectId: ProjectId | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      task,
    }: {
      taskId: TaskId;
      task: UpdateTask;
    }): Promise<Task> => {
      if (!workspaceId || !projectId) {
        throw new Error("Workspace and project are required");
      }
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks[":taskId"].PUT({
        pathParams: { workspaceId, projectId, taskId },
        body: task,
      });
      if (response.status === 200) {
        return response.responseBody as Task;
      }
      throw new Error("Failed to update task");
    },
    onSuccess: (updatedTask) => {
      if (!projectId) return;
      queryClient.setQueryData<Task[]>(tasksQueryKey(projectId), (old) => {
        if (!old) return [updatedTask];
        return old.map((task) =>
          task.id === updatedTask.id ? updatedTask : task,
        );
      });
    },
  });
}

/**
 * Hook to move a task within the queue.
 * Supports optimistic updates with rollback on failure.
 */
export function useMoveTask(
  workspaceId: WorkspaceId | null,
  projectId: ProjectId | null,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      request,
    }: {
      taskId: TaskId;
      request: MoveTaskRequest;
      optimisticTasks: Task[];
    }): Promise<Task> => {
      if (!workspaceId || !projectId) {
        throw new Error("Workspace and project are required");
      }
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks[":taskId"].move.POST({
        pathParams: { workspaceId, projectId, taskId },
        body: request,
      });
      if (response.status === 200) {
        return {
          ...response.responseBody,
          completedOn: response.responseBody.completedOn
            ? new Date(response.responseBody.completedOn)
            : null,
        };
      }
      throw new Error("Failed to move task");
    },
    onMutate: async ({ optimisticTasks }) => {
      if (!projectId) return;

      await queryClient.cancelQueries({ queryKey: tasksQueryKey(projectId) });
      const previousTasks = queryClient.getQueryData<Task[]>(
        tasksQueryKey(projectId),
      );
      queryClient.setQueryData<Task[]>(
        tasksQueryKey(projectId),
        optimisticTasks,
      );
      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (!projectId) return;
      if (context?.previousTasks) {
        queryClient.setQueryData<Task[]>(
          tasksQueryKey(projectId),
          context.previousTasks,
        );
      }
      queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}
