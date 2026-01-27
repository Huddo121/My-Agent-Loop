import type { MoveTaskRequest, ProjectId, TaskId } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import type { NewTask, Task, UpdateTask } from "~/types";

const tasksQueryKey = (projectId: ProjectId | null) =>
  ["tasks", projectId] as const;

/**
 * Hook to fetch tasks for a specific project.
 */
export function useTasks(projectId: ProjectId | null) {
  return useQuery({
    queryKey: tasksQueryKey(projectId),
    queryFn: async (): Promise<Task[]> => {
      // This will only be called when enabled is true (projectId !== null)
      if (projectId === null) {
        throw new Error("Project ID is required");
      }
      const response = await apiClient.projects[":projectId"].tasks.GET({
        pathParams: { projectId },
      });
      if (response.status === 200) {
        return response.responseBody as Task[];
      }
      throw new Error("Failed to fetch tasks");
    },
    enabled: projectId !== null,
  });
}

/**
 * Hook to create a new task for a project.
 */
export function useCreateTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newTask: NewTask): Promise<Task> => {
      if (!projectId) {
        throw new Error("No project selected");
      }
      const response = await apiClient.projects[":projectId"].tasks.POST({
        pathParams: { projectId },
        body: newTask,
      });
      if (response.status === 200) {
        return response.responseBody as Task;
      }
      throw new Error("Failed to create task");
    },
    onSuccess: (newTask) => {
      if (!projectId) return;
      // Update the tasks cache with the new task
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
export function useCompleteTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: TaskId): Promise<Task> => {
      if (!projectId) {
        throw new Error("No project selected");
      }
      const response = await apiClient.projects[":projectId"].tasks[
        ":taskId"
      ].complete.POST({
        pathParams: { projectId, taskId },
      });
      if (response.status === 200) {
        return response.responseBody as Task;
      }
      throw new Error("Failed to complete task");
    },
    onSuccess: (updatedTask) => {
      if (!projectId) return;
      // Update the tasks cache with the updated task
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
export function useUpdateTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      task,
    }: {
      taskId: TaskId;
      task: UpdateTask;
    }): Promise<Task> => {
      if (!projectId) {
        throw new Error("No project selected");
      }
      const response = await apiClient.projects[":projectId"].tasks[
        ":taskId"
      ].PUT({
        pathParams: { projectId, taskId },
        body: task,
      });
      if (response.status === 200) {
        return response.responseBody as Task;
      }
      throw new Error("Failed to update task");
    },
    onSuccess: (updatedTask) => {
      if (!projectId) return;
      // Update the tasks cache with the updated task
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
export function useMoveTask(projectId: ProjectId | null) {
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
      if (!projectId) {
        throw new Error("No project selected");
      }
      const response = await apiClient.projects[":projectId"].tasks[
        ":taskId"
      ].move.POST({
        pathParams: { projectId, taskId },
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

      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: tasksQueryKey(projectId) });

      // Snapshot the previous value for potential rollback
      const previousTasks = queryClient.getQueryData<Task[]>(
        tasksQueryKey(projectId),
      );

      // Update the cache with the optimistic value
      queryClient.setQueryData<Task[]>(
        tasksQueryKey(projectId),
        optimisticTasks,
      );

      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (!projectId) return;
      // Roll back to the previous value on error
      if (context?.previousTasks) {
        queryClient.setQueryData<Task[]>(
          tasksQueryKey(projectId),
          context.previousTasks,
        );
      }
      // Refetch to ensure we're in sync with the server after an error
      queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}
