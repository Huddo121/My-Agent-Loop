import type { ProjectDto, ProjectId, TaskDto } from "@mono/api";
import type { QueryClient } from "@tanstack/react-query";
import { tasksQueryKey } from "~/hooks/useTasks";
import { projectsQueryKey } from "~/lib/projects/useProjects";

/**
 * Patch or insert a project in the workspace projects cache.
 * Used when handling project.updated live events.
 */
export function applyProjectUpdated(
  queryClient: QueryClient,
  project: ProjectDto,
): void {
  const key = projectsQueryKey(project.workspaceId);

  queryClient.setQueryData<ProjectDto[]>(key, (old) => {
    if (!old) return [project];
    const idx = old.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      const nextList = [...old];
      nextList[idx] = project;
      return nextList;
    }
    return [...old, project];
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
  projectId: ProjectId,
  task: TaskDto,
): void {
  const key = tasksQueryKey(projectId);
  const completedOn = task.completedOn;

  queryClient.setQueryData<TaskDto[]>(key, (old) => {
    if (!old) {
      if (completedOn) return undefined;
      return [task];
    }

    const idx = old.findIndex((t) => t.id === task.id);

    if (completedOn) {
      if (idx < 0) return old;
      return old.filter((t) => t.id !== task.id);
    }

    if (idx >= 0) {
      const next = [...old];
      next[idx] = task;
      next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return next;
    }

    const next = [...old, task];
    next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return next;
  });
}
