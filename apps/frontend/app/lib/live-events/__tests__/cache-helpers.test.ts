import type { ProjectId, TaskId, WorkspaceId } from "@mono/api";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { tasksQueryKey } from "~/hooks/useTasks";
import { projectsQueryKey } from "~/lib/projects/useProjects";
import type { Project, Task } from "~/types";
import { applyProjectUpdated, applyTaskUpdated } from "../cache-helpers";

function mkProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1" as ProjectId,
    workspaceId: "ws-1" as WorkspaceId,
    name: "Project",
    shortCode: "PRJ" as Project["shortCode"],
    repositoryUrl: "https://github.com/owner/repo",
    workflowConfiguration: {
      version: "1",
      onTaskCompleted: "push-branch",
    },
    queueState: "idle",
    forgeType: "github",
    forgeBaseUrl: "https://github.com",
    hasForgeToken: false,
    agentConfig: null,
    ...overrides,
  };
}

function mkTask(overrides?: Partial<Task & { position?: number }>): Task & {
  position?: number;
} {
  return {
    id: "task-1" as TaskId,
    title: "Task",
    description: "Desc",
    completedOn: null,
    agentConfig: null,
    subtasks: [],
    position: 0,
    ...overrides,
  };
}

describe("applyProjectUpdated", () => {
  it("patches existing project in cache", () => {
    const queryClient = new QueryClient();
    const initial: Project[] = [
      mkProject({ id: "proj-1" as ProjectId, name: "Original" }),
      mkProject({ id: "proj-2" as ProjectId, name: "Other" }),
    ];
    queryClient.setQueryData(projectsQueryKey("ws-1" as WorkspaceId), initial);

    applyProjectUpdated(
      queryClient,
      mkProject({ id: "proj-1" as ProjectId, name: "Updated" }),
    );

    const result = queryClient.getQueryData<Project[]>(
      projectsQueryKey("ws-1" as WorkspaceId),
    );
    expect(result).toHaveLength(2);
    expect(result?.[0].name).toBe("Updated");
    expect(result?.[1].name).toBe("Other");
  });

  it("inserts project when cache is empty", () => {
    const queryClient = new QueryClient();

    applyProjectUpdated(queryClient, mkProject());

    const result = queryClient.getQueryData<Project[]>(
      projectsQueryKey("ws-1" as WorkspaceId),
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe("proj-1");
  });

  it("inserts new project when not in cache", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(projectsQueryKey("ws-1" as WorkspaceId), [
      mkProject({ id: "proj-1" as ProjectId }),
    ]);

    applyProjectUpdated(
      queryClient,
      mkProject({ id: "proj-2" as ProjectId, name: "New" }),
    );

    const result = queryClient.getQueryData<Project[]>(
      projectsQueryKey("ws-1" as WorkspaceId),
    );
    expect(result).toHaveLength(2);
    expect(result?.find((p) => p.id === "proj-2")?.name).toBe("New");
  });
});

describe("applyTaskUpdated", () => {
  it("inserts new active task when cache is empty", () => {
    const queryClient = new QueryClient();

    applyTaskUpdated(
      queryClient,
      "proj-1" as ProjectId,
      mkTask() as Parameters<typeof applyTaskUpdated>[2],
    );

    const result = queryClient.getQueryData<Task[]>(
      tasksQueryKey("proj-1" as ProjectId),
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe("task-1");
  });

  it("replaces and re-sorts existing task", () => {
    const queryClient = new QueryClient();
    const initial: (Task & { position?: number })[] = [
      mkTask({ id: "task-1" as TaskId, position: 0 }),
      mkTask({ id: "task-2" as TaskId, position: 1 }),
      mkTask({ id: "task-3" as TaskId, position: 2 }),
    ];
    queryClient.setQueryData(tasksQueryKey("proj-1" as ProjectId), initial);

    applyTaskUpdated(
      queryClient,
      "proj-1" as ProjectId,
      mkTask({
        id: "task-1" as TaskId,
        title: "Updated",
        position: 2,
      }) as Parameters<typeof applyTaskUpdated>[2],
    );

    const result = queryClient.getQueryData<Task[]>(
      tasksQueryKey("proj-1" as ProjectId),
    );
    expect(result).toHaveLength(3);
    const t1 = result?.find((t) => t.id === "task-1");
    expect(t1?.title).toBe("Updated");
  });

  it("removes completed task from active queue cache", () => {
    const queryClient = new QueryClient();
    const initial: (Task & { position?: number })[] = [
      mkTask({ id: "task-1" as TaskId, position: 0 }),
      mkTask({ id: "task-2" as TaskId, position: 1 }),
    ];
    queryClient.setQueryData(tasksQueryKey("proj-1" as ProjectId), initial);

    applyTaskUpdated(
      queryClient,
      "proj-1" as ProjectId,
      mkTask({
        id: "task-1" as TaskId,
        completedOn: new Date("2025-01-15"),
      }) as Parameters<typeof applyTaskUpdated>[2],
    );

    const result = queryClient.getQueryData<Task[]>(
      tasksQueryKey("proj-1" as ProjectId),
    );
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe("task-2");
  });

  it("does not add completed task when cache is empty", () => {
    const queryClient = new QueryClient();

    applyTaskUpdated(
      queryClient,
      "proj-1" as ProjectId,
      mkTask({
        id: "task-1" as TaskId,
        completedOn: new Date("2025-01-15"),
      }) as Parameters<typeof applyTaskUpdated>[2],
    );

    const result = queryClient.getQueryData<Task[]>(
      tasksQueryKey("proj-1" as ProjectId),
    );
    expect(result).toBeUndefined();
  });
});
