import type { ProjectId, TaskDto, TaskId } from "@mono/api";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { mergeTaskIntoTasksList, tasksQueryKey } from "./useTasks";

function mkTask(overrides?: Partial<TaskDto>): TaskDto {
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

describe("mergeTaskIntoTasksList", () => {
  it("returns a single-item list when cache is empty", () => {
    const task = mkTask();
    expect(mergeTaskIntoTasksList(undefined, task)).toEqual([task]);
  });

  it("appends a new task and sorts by position", () => {
    const existing = [
      mkTask({ id: "a" as TaskId, position: 0 }),
      mkTask({ id: "b" as TaskId, position: 1 }),
    ];
    const created = mkTask({
      id: "c" as TaskId,
      position: 2,
      title: "New",
    });
    const merged = mergeTaskIntoTasksList(existing, created);
    expect(merged).toHaveLength(3);
    expect(merged.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("does not duplicate when the task is already present (live event before mutation success)", () => {
    const fromLive = mkTask({
      id: "new" as TaskId,
      title: "From SSE",
      position: 1,
    });
    const existing = [mkTask({ id: "a" as TaskId, position: 0 }), fromLive];
    const fromMutation = mkTask({
      id: "new" as TaskId,
      title: "From API",
      position: 1,
    });
    const merged = mergeTaskIntoTasksList(existing, fromMutation);
    expect(merged).toHaveLength(2);
    expect(merged.find((t) => t.id === ("new" as TaskId))?.title).toBe(
      "From API",
    );
  });

  it("keeps a single row when simulating SSE then create success on the tasks query", () => {
    const queryClient = new QueryClient();
    const projectId = "proj-1" as ProjectId;
    const key = tasksQueryKey(projectId);
    queryClient.setQueryData<TaskDto[]>(key, [
      mkTask({ id: "a" as TaskId, position: 0 }),
    ]);

    const created = mkTask({
      id: "b" as TaskId,
      title: "Created",
      position: 1,
    });

    queryClient.setQueryData<TaskDto[]>(key, (old) =>
      mergeTaskIntoTasksList(old, created),
    );
    queryClient.setQueryData<TaskDto[]>(key, (old) =>
      mergeTaskIntoTasksList(old, { ...created, title: "From mutation" }),
    );

    const result = queryClient.getQueryData<TaskDto[]>(key);
    expect(result).toHaveLength(2);
    expect(result?.filter((t) => t.id === ("b" as TaskId))).toHaveLength(1);
    expect(result?.find((t) => t.id === ("b" as TaskId))?.title).toBe(
      "From mutation",
    );
  });
});
