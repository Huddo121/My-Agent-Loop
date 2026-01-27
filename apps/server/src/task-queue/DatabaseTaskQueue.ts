import type { ProjectId, TaskId } from "@mono/api";
import { and, asc, count, eq, isNotNull, isNull, max, min } from "drizzle-orm";
import { tasksTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";
import type {
  GetAllTasksOptions,
  MoveTaskRequest,
  NewTask,
  Task,
  TaskQueue,
  UpdateTask,
} from "./TaskQueue";

/** Gap between positions when adding new tasks */
const POSITION_GAP = 128;

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
      .orderBy(asc(tasksTable.position), asc(tasksTable.id));
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

    // Find the maximum position for incomplete tasks in this project
    const [{ maxPosition }] = await tx
      .select({ maxPosition: max(tasksTable.position) })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.projectId, projectId),
          isNull(tasksTable.completedOn),
        ),
      );

    const newPosition = (maxPosition ?? 0) + POSITION_GAP;

    const [newTask] = await tx
      .insert(tasksTable)
      .values({ ...task, projectId, position: newPosition })
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
      .orderBy(asc(tasksTable.position), asc(tasksTable.id))
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
      .set({ completedOn: new Date(), position: null })
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

  async moveTask(
    id: TaskId,
    request: MoveTaskRequest,
  ): Promise<Task | undefined> {
    const tx = getTransaction();

    // First, get the task we're moving and verify it exists and is not completed
    const taskToMove = await tx.query.tasksTable.findFirst({
      where: and(eq(tasksTable.id, id), isNull(tasksTable.completedOn)),
    });

    if (!taskToMove || taskToMove.position === null) {
      return undefined;
    }

    let newPosition: number;

    if (request.method === "absolute") {
      if (request.position === "first") {
        // Find the minimum position among incomplete tasks in this project
        const [{ minPosition }] = await tx
          .select({ minPosition: min(tasksTable.position) })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.projectId, taskToMove.projectId),
              isNull(tasksTable.completedOn),
            ),
          );

        // Place before the first item
        newPosition = (minPosition ?? POSITION_GAP) - POSITION_GAP;
      } else {
        // position === "last"
        // Find the maximum position among incomplete tasks in this project
        const [{ maxPosition }] = await tx
          .select({ maxPosition: max(tasksTable.position) })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.projectId, taskToMove.projectId),
              isNull(tasksTable.completedOn),
            ),
          );

        newPosition = (maxPosition ?? 0) + POSITION_GAP;
      }
    } else {
      // request.method === "relative"
      // Get both reference tasks and validate them
      const [beforeTask, afterTask] = await Promise.all([
        tx.query.tasksTable.findFirst({
          where: and(
            eq(tasksTable.id, request.before),
            isNull(tasksTable.completedOn),
          ),
        }),
        tx.query.tasksTable.findFirst({
          where: and(
            eq(tasksTable.id, request.after),
            isNull(tasksTable.completedOn),
          ),
        }),
      ]);

      // Validate both tasks exist, have positions, and are not completed
      if (
        !beforeTask ||
        !afterTask ||
        beforeTask.position === null ||
        afterTask.position === null
      ) {
        return undefined;
      }

      // Calculate midpoint between the two tasks
      newPosition = (afterTask.position + beforeTask.position) / 2;
    }

    // NB: This could result in two tasks with the same position. The task's ID will tie-break if necessary
    // Update the task's position
    const [updatedTask] = await tx
      .update(tasksTable)
      .set({ position: newPosition })
      .where(eq(tasksTable.id, id))
      .returning();

    if (!updatedTask) {
      return undefined;
    }

    return fromTaskEntity(updatedTask);
  }
}
