import type { ProjectId, TaskId, TaskNumber } from "@mono/api";
import type {
  GetAllTasksOptions,
  MoveTaskRequest,
  NewTask,
  Task,
  TaskQueue,
  UpdateTask,
} from "../task-queue/TaskQueue";

/**
 * Per-project task queue in memory; suitable for handler tests and workflow doubles.
 */
export class FakeTaskQueue implements TaskQueue {
  private readonly tasks = new Map<TaskId, Task>();
  private readonly taskProject = new Map<TaskId, ProjectId>();
  private nextTaskNumber = new Map<ProjectId, number>();
  private addCounter = 0;

  /** Register an existing task (e.g. workflow tests). */
  seedTask(task: Task, projectId: ProjectId): void {
    this.tasks.set(task.id, structuredClone(task));
    this.taskProject.set(task.id, projectId);
    const n = this.nextTaskNumber.get(projectId) ?? 0;
    if (task.taskNumber > n) {
      this.nextTaskNumber.set(projectId, task.taskNumber);
    }
  }

  async getAllTasks(
    projectId: ProjectId,
    options?: GetAllTasksOptions,
  ): Promise<Task[]> {
    const list = Array.from(this.taskProject.entries())
      .filter(([, pid]) => pid === projectId)
      .map(([tid]) => this.tasks.get(tid))
      .filter((t): t is Task => t !== undefined);
    if (options?.includeCompleted === false) {
      return list.filter((t) => t.completedOn === undefined);
    }
    return list;
  }

  async getTask(id: TaskId): Promise<Task | undefined> {
    const t = this.tasks.get(id);
    return t === undefined ? undefined : structuredClone(t);
  }

  async getProjectIdForTask(taskId: TaskId): Promise<ProjectId | undefined> {
    return this.taskProject.get(taskId);
  }

  async addTask(projectId: ProjectId, task: NewTask): Promise<Task> {
    this.addCounter++;
    const id = `task-${this.addCounter}` as TaskId;
    const n = (this.nextTaskNumber.get(projectId) ?? 0) + 1;
    this.nextTaskNumber.set(projectId, n);
    const row: Task = {
      id,
      taskNumber: n as TaskNumber,
      title: task.title,
      description: task.description,
      subtasks: task.subtasks ?? [],
    };
    this.tasks.set(id, row);
    this.taskProject.set(id, projectId);
    return structuredClone(row);
  }

  async updateTask(id: TaskId, task: UpdateTask): Promise<Task | undefined> {
    const current = this.tasks.get(id);
    if (current === undefined) return undefined;
    const next: Task = {
      ...current,
      ...task,
      subtasks: task.subtasks ?? current.subtasks,
    };
    this.tasks.set(id, next);
    return structuredClone(next);
  }

  async getNextTask(projectId: ProjectId): Promise<Task | undefined> {
    for (const task of this.tasks.values()) {
      if (
        this.taskProject.get(task.id) === projectId &&
        task.completedOn === undefined
      ) {
        return structuredClone(task);
      }
    }
    return undefined;
  }

  async isEmpty(projectId: ProjectId): Promise<boolean> {
    const tasks = await this.getAllTasks(projectId);
    return tasks.length === 0;
  }

  async completeTask(id: TaskId): Promise<Task | undefined> {
    const current = this.tasks.get(id);
    if (current === undefined) return undefined;
    const next: Task = { ...current, completedOn: new Date() };
    this.tasks.set(id, next);
    return structuredClone(next);
  }

  async moveTask(
    id: TaskId,
    _request: MoveTaskRequest,
  ): Promise<Task | undefined> {
    return this.getTask(id);
  }

  async taskCount(
    projectId: ProjectId,
  ): Promise<{ total: number; completed: number }> {
    const all = await this.getAllTasks(projectId, {
      includeCompleted: true,
    });
    const completed = all.filter((t) => t.completedOn !== undefined).length;
    return { total: all.length, completed };
  }
}
