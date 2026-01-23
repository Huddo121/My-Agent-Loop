import * as fs from "node:fs";
import { join } from "node:path";
import type { ProjectId, TaskId } from "@mono/api";
import type {
  GetAllTasksOptions,
  NewTask,
  Task,
  TaskQueue,
  UpdateTask,
} from "./TaskQueue";

/** Simple implementation of the task queue that stores its state in files, one per project */
export class FileTaskQueue implements TaskQueue {
  constructor(private readonly directoryPath: string) {
    // Create the directory if it doesn't exist (like mkdir -p)
    if (!fs.existsSync(this.directoryPath)) {
      fs.mkdirSync(this.directoryPath, { recursive: true });
    }

    // Validate that the path is a directory (not a file)
    const stats = fs.statSync(this.directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(
        `FileTaskQueue path is not a directory: ${this.directoryPath}`,
      );
    }
  }

  private getFilePath(projectId: ProjectId): string {
    return join(this.directoryPath, `${projectId}.json`);
  }

  private ensureProjectFile(projectId: ProjectId): void {
    const filePath = this.getFilePath(projectId);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]");
    }
  }

  async getAllTasks(
    projectId: ProjectId,
    options?: GetAllTasksOptions,
  ): Promise<Task[]> {
    this.ensureProjectFile(projectId);
    const tasks = this.getTasks(projectId);
    if (options?.includeCompleted === true) {
      return tasks;
    }
    return tasks.filter((t) => t.completedOn === undefined);
  }

  async getTask(id: TaskId): Promise<Task | undefined> {
    const files = fs.readdirSync(this.directoryPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const projectId = file.replace(".json", "") as ProjectId;
      const tasks = this.getTasks(projectId);
      const foundTask = tasks.find((t) => t.id === id);
      if (foundTask !== undefined) {
        return foundTask;
      }
    }
  }

  async addTask(projectId: ProjectId, newTask: NewTask): Promise<Task> {
    this.ensureProjectFile(projectId);
    const tasks = this.getTasks(projectId);
    const taskId = crypto.randomUUID() as TaskId;
    const task = { id: taskId, ...newTask };

    tasks.push(task);

    this.writeTasks(projectId, tasks);
    return Promise.resolve(task);
  }

  async updateTask(id: TaskId, task: UpdateTask): Promise<Task | undefined> {
    // Since we don't know which project this task belongs to, we need to search all files
    const files = fs.readdirSync(this.directoryPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const projectId = file.replace(".json", "") as ProjectId;
      const tasks = this.getTasks(projectId);
      const taskIndex = tasks.findIndex((t) => t.id === id);

      if (taskIndex !== -1) {
        const updatedTask = {
          ...tasks[taskIndex],
          ...task,
        };
        tasks[taskIndex] = updatedTask;
        this.writeTasks(projectId, tasks);
        return updatedTask;
      }
    }

    return undefined;
  }

  async getNextTask(projectId: ProjectId): Promise<Task | undefined> {
    this.ensureProjectFile(projectId);
    const tasks = this.getTasks(projectId);
    return tasks.filter((t) => t.completedOn === undefined).shift();
  }

  async isEmpty(projectId: ProjectId): Promise<boolean> {
    this.ensureProjectFile(projectId);
    const tasks = this.getTasks(projectId);
    return tasks.filter((t) => t.completedOn === undefined).length === 0;
  }

  async completeTask(id: TaskId): Promise<Task | undefined> {
    // Since we don't know which project this task belongs to, we need to search all files
    const files = fs.readdirSync(this.directoryPath);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const projectId = file.replace(".json", "") as ProjectId;
      const tasks = this.getTasks(projectId);
      const taskIndex = tasks.findIndex((t) => t.id === id);

      if (taskIndex !== -1) {
        const updatedTask = {
          ...tasks[taskIndex],
          completedOn:
            tasks[taskIndex].completedOn === undefined
              ? new Date()
              : tasks[taskIndex].completedOn,
        };
        tasks[taskIndex] = updatedTask;
        this.writeTasks(projectId, tasks);
        return updatedTask;
      }
    }

    return undefined;
  }

  async taskCount(
    projectId: ProjectId,
  ): Promise<{ total: number; completed: number }> {
    this.ensureProjectFile(projectId);
    const tasks = this.getTasks(projectId);
    return {
      total: tasks.length,
      completed: tasks.filter((t) => t.completedOn !== undefined).length,
    };
  }

  /** Saves the task state provided, completely overwriting the previous task state */
  private writeTasks(projectId: ProjectId, tasks: Task[]): void {
    const filePath = this.getFilePath(projectId);
    fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2));
  }

  private getTasks(projectId: ProjectId): Task[] {
    const filePath = this.getFilePath(projectId);
    const fileContents = fs.readFileSync(filePath, "utf8");
    return JSON.parse(fileContents);
  }
}
