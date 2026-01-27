import type { ProjectId, TaskId } from "@mono/api";

export interface Task {
  id: TaskId;
  title: string;
  description: string;
  completedOn?: Date;
}

export type NewTask = Pick<Task, "title" | "description">;
export type UpdateTask = Pick<Task, "title" | "description">;

export type GetAllTasksOptions = {
  includeCompleted?: boolean;
};

export type MoveTaskRequest =
  | {
      method: "absolute";
      position: "first" | "last";
    }
  | {
      method: "relative";
      before: TaskId;
      after: TaskId;
    };

export interface TaskQueue {
  getAllTasks(
    projectId: ProjectId,
    options?: GetAllTasksOptions,
  ): Promise<Task[]>;
  getTask(id: TaskId): Promise<Task | undefined>;
  addTask(projectId: ProjectId, task: NewTask): Promise<Task>;
  updateTask(id: TaskId, task: UpdateTask): Promise<Task | undefined>;
  getNextTask(projectId: ProjectId): Promise<Task | undefined>;
  isEmpty(projectId: ProjectId): Promise<boolean>;
  completeTask(id: TaskId): Promise<Task | undefined>;
  /**
   * Move a task within the queue.
   * Can either move the task to the first or last position, or to between two other tasks.
   */
  moveTask(id: TaskId, request: MoveTaskRequest): Promise<Task | undefined>;
  taskCount(
    projectId: ProjectId,
  ): Promise<{ total: number; completed: number }>;
}
