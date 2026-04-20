import type { MoveTaskRequest, ProjectId, TaskDto, TaskId } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";
import { handleUnauthenticated } from "~/lib/auth/api-errors";
import { useCurrentWorkspace } from "~/lib/workspaces";
import type { NewTask, Task, UpdateTask } from "~/types";

export const tasksQueryKey = (projectId: ProjectId | null) =>
  ["tasks", projectId] as const;

/**
 * Merges a task into the cached task list for create-mutation success handling.
 * Upserts by id so we do not duplicate when a `task.updated` live event has
 * already inserted the same task (race with mutation `onSuccess`).
 */
export function mergeTaskIntoTasksList(
  old: TaskDto[] | undefined,
  task: TaskDto,
): TaskDto[] {
  if (!old) return [task];
  const idx = old.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    const next = [...old];
    next[idx] = task;
    next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return next;
  }
  const next = [...old, task];
  next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return next;
}

/**
 * Hook to fetch tasks for a specific project. Must be used inside CurrentWorkspaceProvider.
 */
export function useTasks(projectId: ProjectId | null) {
  const workspace = useCurrentWorkspace();
  return useQuery({
    queryKey: tasksQueryKey(projectId),
    queryFn: async (): Promise<TaskDto[]> => {
      if (projectId === null) throw new Error("Project ID is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks.GET({
        pathParams: { workspaceId: workspace.id, projectId },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to fetch tasks");
    },
    enabled: projectId !== null,
  });
}

/**
 * Hook to create a new task for a project. Must be used inside CurrentWorkspaceProvider.
 */
export function useCreateTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async (newTask: NewTask): Promise<TaskDto> => {
      if (!projectId) throw new Error("Project is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks.POST({
        pathParams: { workspaceId: workspace.id, projectId },
        body: newTask,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to create task");
    },
    onSuccess: (newTask) => {
      if (!projectId) return;
      queryClient.setQueryData<TaskDto[]>(tasksQueryKey(projectId), (old) =>
        mergeTaskIntoTasksList(old, newTask),
      );
    },
  });
}

/**
 * Hook to mark a task as completed. Must be used inside CurrentWorkspaceProvider.
 */
export function useCompleteTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async (taskId: TaskId): Promise<TaskDto> => {
      if (!projectId) throw new Error("Project is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks[":taskId"].complete.POST({
        pathParams: { workspaceId: workspace.id, projectId, taskId },
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to complete task");
    },
    onSuccess: (updatedTask) => {
      if (!projectId) return;
      queryClient.setQueryData<TaskDto[]>(tasksQueryKey(projectId), (old) => {
        if (!old) return [updatedTask];
        return old.map((task) =>
          task.id === updatedTask.id ? updatedTask : task,
        );
      });
    },
  });
}

/**
 * Hook to update an existing task. Must be used inside CurrentWorkspaceProvider.
 */
export function useUpdateTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async ({
      taskId,
      task,
    }: {
      taskId: TaskId;
      task: UpdateTask;
    }): Promise<TaskDto> => {
      if (!projectId) throw new Error("Project is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks[":taskId"].PUT({
        pathParams: { workspaceId: workspace.id, projectId, taskId },
        body: task,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to update task");
    },
    onSuccess: (updatedTask) => {
      if (!projectId) return;
      queryClient.setQueryData<TaskDto[]>(tasksQueryKey(projectId), (old) => {
        if (!old) return [updatedTask];
        return old.map((task) =>
          task.id === updatedTask.id ? updatedTask : task,
        );
      });
    },
  });
}

/**
 * Hook to move a task within the queue. Must be used inside CurrentWorkspaceProvider.
 * Supports optimistic updates with rollback on failure.
 */
export function useMoveTask(projectId: ProjectId | null) {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  return useMutation({
    mutationFn: async ({
      taskId,
      request,
    }: {
      taskId: TaskId;
      request: MoveTaskRequest;
      optimisticTasks: Task[];
    }): Promise<TaskDto> => {
      if (!projectId) throw new Error("Project is required");
      const response = await apiClient.workspaces[":workspaceId"].projects[
        ":projectId"
      ].tasks[":taskId"].move.POST({
        pathParams: { workspaceId: workspace.id, projectId, taskId },
        body: request,
      });
      if (response.status === 200) {
        return response.responseBody;
      }
      if (response.status === 401) {
        return handleUnauthenticated();
      }
      throw new Error("Failed to move task");
    },
    onMutate: async ({ optimisticTasks }) => {
      if (!projectId) return;

      await queryClient.cancelQueries({ queryKey: tasksQueryKey(projectId) });
      const previousTasks = queryClient.getQueryData<TaskDto[]>(
        tasksQueryKey(projectId),
      );
      queryClient.setQueryData<TaskDto[]>(
        tasksQueryKey(projectId),
        optimisticTasks,
      );
      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (!projectId) return;
      if (context?.previousTasks) {
        queryClient.setQueryData<TaskDto[]>(
          tasksQueryKey(projectId),
          context.previousTasks,
        );
      }
      queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId) });
    },
  });
}
