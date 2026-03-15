import {
  badUserInput,
  notFound,
  type Subtask,
  subtaskIdSchema,
  subtaskSchema,
  taskIdSchema,
  unauthenticated,
} from "@mono/api";
import type { Hono } from "hono";
import z from "zod";
import type { RunId } from "../runs/RunId";
import type { Services } from "../services";
import type { Task } from "../task-queue/TaskQueue";
import { withNewTransaction } from "../utils/transaction-context";

const DRIVER_TOKEN_HEADER = "X-MAL-Driver-Token";

const driverTaskSnapshotSchema = z.object({
  title: z.string(),
  description: z.string(),
  subtasks: z.array(subtaskSchema),
});

const syncTaskSnapshotRequestSchema = z.object({
  taskSnapshot: driverTaskSnapshotSchema,
  subtaskId: subtaskIdSchema.optional(),
  iteration: z.number().int().min(1),
  harnessExitCode: z.number().int(),
  progressState: z.enum(["none", "progress", "complete"]),
  progressReason: z.string(),
});

type DriverApiServices = Pick<
  Services,
  "db" | "driverRunTokenStore" | "runsService" | "taskQueue"
>;

export function registerDriverApiRoutes(
  app: Hono,
  services: DriverApiServices,
): void {
  app.get("/internal/driver/runs/:runId/tasks/:taskId", async (ctx) => {
    const authFailure = authenticateDriverRequest(
      services,
      ctx.req.param("runId") as RunId,
      ctx.req.header(DRIVER_TOKEN_HEADER),
    );
    if (authFailure !== null) {
      return ctx.json(authFailure[1], authFailure[0]);
    }

    return withNewTransaction(services.db, async () => {
      const task = await getRunTaskOrNull(
        services,
        ctx.req.param("runId") as RunId,
        ctx.req.param("taskId"),
      );
      if (task === null) {
        const response = notFound();
        return ctx.json(response[1], response[0]);
      }

      const validationError = validateRequestedSubtask(
        task,
        ctx.req.query("subtaskId"),
      );
      if (validationError !== null) {
        return ctx.json(validationError[1], validationError[0]);
      }

      return ctx.json(toDriverTaskSnapshot(task));
    });
  });

  app.put("/internal/driver/runs/:runId/tasks/:taskId", async (ctx) => {
    const authFailure = authenticateDriverRequest(
      services,
      ctx.req.param("runId") as RunId,
      ctx.req.header(DRIVER_TOKEN_HEADER),
    );
    if (authFailure !== null) {
      return ctx.json(authFailure[1], authFailure[0]);
    }

    let body: z.infer<typeof syncTaskSnapshotRequestSchema>;
    try {
      body = syncTaskSnapshotRequestSchema.parse(await ctx.req.json());
    } catch {
      const response = badUserInput("Invalid driver task snapshot payload.");
      return ctx.json(response[1], response[0]);
    }

    return withNewTransaction(services.db, async () => {
      const task = await getRunTaskOrNull(
        services,
        ctx.req.param("runId") as RunId,
        ctx.req.param("taskId"),
      );
      if (task === null) {
        const response = notFound();
        return ctx.json(response[1], response[0]);
      }

      const requestedSubtaskId = body.subtaskId ?? ctx.req.query("subtaskId");
      const validationError = validateRequestedSubtask(
        body.taskSnapshot,
        requestedSubtaskId,
      );
      if (validationError !== null) {
        return ctx.json(validationError[1], validationError[0]);
      }

      const taskId = taskIdSchema.parse(ctx.req.param("taskId"));
      const updatedTask = await services.taskQueue.updateTask(taskId, {
        title: body.taskSnapshot.title,
        description: body.taskSnapshot.description,
        subtasks: body.taskSnapshot.subtasks,
      });
      if (updatedTask === undefined) {
        const response = notFound();
        return ctx.json(response[1], response[0]);
      }

      return new Response(null, { status: 204 });
    });
  });
}

function authenticateDriverRequest(
  services: DriverApiServices,
  runId: RunId,
  driverToken: string | undefined,
): ReturnType<typeof unauthenticated> | null {
  if (driverToken === undefined || driverToken.length === 0) {
    return unauthenticated("Driver token is required.");
  }

  if (!services.driverRunTokenStore.isValidToken(runId, driverToken)) {
    return unauthenticated("Driver token is invalid.");
  }

  return null;
}

async function getRunTaskOrNull(
  services: DriverApiServices,
  runId: RunId,
  taskId: string,
): Promise<Task | null> {
  const run = await services.runsService.getRun(runId);
  if (run === undefined || run.taskId !== taskId) {
    return null;
  }

  const task = await services.taskQueue.getTask(run.taskId);
  return task ?? null;
}

function validateRequestedSubtask(
  taskSnapshot: { subtasks: readonly Subtask[] },
  rawSubtaskId: string | undefined,
): ReturnType<typeof badUserInput> | null {
  if (rawSubtaskId === undefined) {
    return null;
  }

  const parsed = subtaskIdSchema.safeParse(rawSubtaskId);
  if (!parsed.success) {
    return badUserInput("Invalid subtask id.");
  }

  if (!taskSnapshot.subtasks.some((subtask) => subtask.id === parsed.data)) {
    return badUserInput(
      "Requested subtask was not found in the task snapshot.",
    );
  }

  return null;
}

function toDriverTaskSnapshot(task: Task) {
  return {
    title: task.title,
    description: task.description,
    subtasks: task.subtasks,
  };
}
