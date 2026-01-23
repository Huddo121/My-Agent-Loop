import type { ProjectId, TaskId } from "@mono/api";
import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { tasksTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";
import type {
  GetAllTasksOptions,
  NewTask,
  Task,
  TaskQueue,
  UpdateTask,
} from "./TaskQueue";

const fromTaskEntity = (task: typeof tasksTable.$inferSelect): Task => {
  return {
    id: task.id as TaskId,
    title: task.title,
    description: task.description,
    completedOn: task.completedOn ?? undefined,
  };
};

export class DatabaseTaskQueue implements TaskQueue {
  async getAllTasks(
    projectId: ProjectId,
    options?: GetAllTasksOptions,
  ): Promise<Task[]> {
    const tx = getTransaction();
    const where = options?.includeCompleted
      ? undefined
      : isNull(tasksTable.completedOn);
    const tasks = await tx
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.projectId, projectId), where))
      .orderBy(asc(tasksTable.createdAt), asc(tasksTable.id));
    return tasks.map(fromTaskEntity);
  }

  async getTask(id: TaskId): Promise<Task | undefined> {
    const tx = getTransaction();
    const entity = await tx.query.tasksTable.findFirst({
      where: eq(tasksTable.id, id),
    });
    if (entity === undefined) {
      return undefined;
    }
    return fromTaskEntity(entity);
  }

  async addTask(projectId: ProjectId, task: NewTask): Promise<Task> {
    const tx = getTransaction();
    const [newTask] = await tx
      .insert(tasksTable)
      .values({ ...task, projectId })
      .returning();
    console.info("Added to task to database backed queue", {
      taskId: newTask.id,
    });

    return fromTaskEntity(newTask);
  }

  async updateTask(id: TaskId, task: UpdateTask): Promise<Task | undefined> {
    const tx = getTransaction();
    const [updatedTask] = await tx
      .update(tasksTable)
      .set(task)
      .where(eq(tasksTable.id, id))
      .returning();

    if (!updatedTask) {
      return undefined;
    }

    return fromTaskEntity(updatedTask);
  }

  async getNextTask(projectId: ProjectId): Promise<Task | undefined> {
    const tx = getTransaction();
    const foundTasks = await tx
      .select()
      .from(tasksTable)
      .where(
        and(
          isNull(tasksTable.completedOn),
          eq(tasksTable.projectId, projectId),
        ),
      )
      .orderBy(asc(tasksTable.createdAt), asc(tasksTable.id))
      .limit(1);

    const mappedTasks = foundTasks.map(fromTaskEntity);

    return mappedTasks.shift();
  }

  async isEmpty(projectId: ProjectId): Promise<boolean> {
    const tx = getTransaction();
    const foundTasksCount = await tx
      .select({ count: count() })
      .from(tasksTable)
      .where(
        and(
          isNull(tasksTable.completedOn),
          eq(tasksTable.projectId, projectId),
        ),
      )
      .then((result) => result[0]?.count ?? 0);

    return foundTasksCount === 0;
  }

  async completeTask(id: TaskId): Promise<Task | undefined> {
    const tx = getTransaction();
    const [updatedTask] = await tx
      .update(tasksTable)
      .set({ completedOn: new Date() })
      .where(and(eq(tasksTable.id, id), isNull(tasksTable.completedOn)))
      .returning();

    if (!updatedTask) {
      return undefined;
    }

    return fromTaskEntity(updatedTask);
  }

  async taskCount(
    projectId: ProjectId,
  ): Promise<{ total: number; completed: number }> {
    const tx = getTransaction();
    const totalCount = await tx
      .select({ count: count() })
      .from(tasksTable)
      .where(eq(tasksTable.projectId, projectId))
      .then((result) => result[0]?.count ?? 0);
    const completedCount = await tx
      .select({ count: count() })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.projectId, projectId),
          isNotNull(tasksTable.completedOn),
        ),
      )
      .then((result) => result[0]?.count ?? 0);

    return { total: totalCount, completed: completedCount };
  }
}
