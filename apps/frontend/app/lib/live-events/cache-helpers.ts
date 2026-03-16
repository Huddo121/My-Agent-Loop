import type { ProjectDto, TaskDto, WorkspaceId } from "@mono/api";
import type { QueryClient } from "@tanstack/react-query";
import { tasksQueryKey } from "~/hooks/useTasks";
import { projectsQueryKey } from "~/lib/projects/useProjects";
import type { Project, Task } from "~/types";

function taskPosition(task: Task | TaskDto): number {
  const pos = "position" in task ? (task as TaskDto).position : undefined;
  return typeof pos === "number" ? pos : 0;
}

/**
 * Patch or insert a project in the workspace projects cache.
 * Used when handling project.updated live events.
 */
export function applyProjectUpdated(
  queryClient: QueryClient,
  project: ProjectDto | Project,
): void {
  const workspaceId = project.workspaceId as WorkspaceId;
  const key = projectsQueryKey(workspaceId);

  queryClient.setQueryData<Project[]>(key, (old) => {
    const next = project as Project;
    if (!old) return [next];
    const idx = old.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      const nextList = [...old];
      nextList[idx] = next;
      return nextList;
    }
    return [...old, next];
  });
}

/**
 * Update the selected project's task list cache from a task.updated event.
 * - Insert if not present and still active
 * - Replace and re-sort if exists
 * - Remove from active queue when completedOn is set
 */
export function applyTaskUpdated(
  queryClient: QueryClient,
  projectId: string,
  task: TaskDto,
): void {
  const key = tasksQueryKey(projectId);
  const completedOn = task.completedOn;

  queryClient.setQueryData<Task[]>(key, (old) => {
    const taskAsTask = task as unknown as Task;
    if (!old) {
      if (completedOn) return undefined;
      return [taskAsTask];
    }

    const idx = old.findIndex((t) => t.id === task.id);

    if (completedOn) {
      if (idx < 0) return old;
      return old.filter((t) => t.id !== task.id);
    }

    if (idx >= 0) {
      const next = [...old];
      next[idx] = taskAsTask;
      next.sort((a, b) => taskPosition(a) - taskPosition(b));
      return next;
    }

    const next = [...old, taskAsTask];
    next.sort((a, b) => taskPosition(a) - taskPosition(b));
    return next;
  });
}
