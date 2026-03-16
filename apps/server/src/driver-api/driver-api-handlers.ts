import { badUserInput, notFound, unauthenticated } from "@mono/api";
import type { Hono } from "hono";
import z from "zod";
import type { RunId } from "../runs/RunId";
import type { Services } from "../services";

const DRIVER_TOKEN_HEADER = "X-MAL-Driver-Token";

/**
 * Log event sent by the driver.
 * stream: "stdout" or "stderr" - indicates which output stream the log line came from
 */
const logEventSchema = z.object({
  message: z.string(),
  stream: z.enum(["stdout", "stderr"]),
});

/**
 * Lifecycle events sent by the driver to indicate harness state changes.
 */
const lifecycleEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("harness-starting"),
    harnessCommand: z.string(),
  }),
  z.object({
    kind: z.literal("harness-exited"),
    exitCode: z.number().int(),
    signal: z.string().nullable(),
  }),
]);

type DriverApiServices = Pick<
  Services,
  "db" | "driverRunTokenStore" | "runsService"
>;

/**
 * In-memory store for driver log events.
 * This is a simple implementation - a production system would use Redis streams.
 * Logs are keyed by runId, with an array of log entries.
 */
const driverLogs = new Map<
  RunId,
  { timestamp: Date; stream: "stdout" | "stderr"; message: string }[]
>();

export function registerDriverApiRoutes(
  app: Hono,
  services: DriverApiServices,
): void {
  /**
   * Receive log events from the driver.
   * POST /internal/driver/runs/:runId/tasks/:taskId/logs
   */
  app.post("/internal/driver/runs/:runId/tasks/:taskId/logs", async (ctx) => {
    const authFailure = authenticateDriverRequest(
      services,
      ctx.req.param("runId") as RunId,
      ctx.req.header(DRIVER_TOKEN_HEADER),
    );
    if (authFailure !== null) {
      return ctx.json(authFailure[1], authFailure[0]);
    }

    const runId = ctx.req.param("runId") as RunId;

    // Verify the run exists and has the correct taskId
    const run = await services.runsService.getRun(runId);
    if (run === undefined) {
      const response = notFound("Run not found.");
      return ctx.json(response[1], response[0]);
    }

    if (run.taskId !== ctx.req.param("taskId")) {
      const response = notFound("Task not found for this run.");
      return ctx.json(response[1], response[0]);
    }

    let body: z.infer<typeof logEventSchema>;
    try {
      body = logEventSchema.parse(await ctx.req.json());
    } catch {
      const response = badUserInput("Invalid log event payload.");
      return ctx.json(response[1], response[0]);
    }

    // Store the log event
    let logs = driverLogs.get(runId);
    if (logs === undefined) {
      logs = [];
      driverLogs.set(runId, logs);
    }
    logs.push({
      timestamp: new Date(),
      stream: body.stream,
      message: body.message,
    });

    return new Response(null, { status: 204 });
  });

  /**
   * Receive lifecycle events from the driver.
   * POST /internal/driver/runs/:runId/tasks/:taskId/lifecycle
   */
  app.post(
    "/internal/driver/runs/:runId/tasks/:taskId/lifecycle",
    async (ctx) => {
      const authFailure = authenticateDriverRequest(
        services,
        ctx.req.param("runId") as RunId,
        ctx.req.header(DRIVER_TOKEN_HEADER),
      );
      if (authFailure !== null) {
        return ctx.json(authFailure[1], authFailure[0]);
      }

      const runId = ctx.req.param("runId") as RunId;

      // Verify the run exists and has the correct taskId
      const run = await services.runsService.getRun(runId);
      if (run === undefined) {
        const response = notFound("Run not found.");
        return ctx.json(response[1], response[0]);
      }

      if (run.taskId !== ctx.req.param("taskId")) {
        const response = notFound("Task not found for this run.");
        return ctx.json(response[1], response[0]);
      }

      let body: z.infer<typeof lifecycleEventSchema>;
      try {
        body = lifecycleEventSchema.parse(await ctx.req.json());
      } catch {
        const response = badUserInput("Invalid lifecycle event payload.");
        return ctx.json(response[1], response[0]);
      }

      // Handle lifecycle events
      if (body.kind === "harness-exited") {
        // Update the run state based on the harness exit code
        const newState = body.exitCode === 0 ? "completed" : "failed";
        await services.runsService.updateRunState(runId, newState);
      }

      return new Response(null, { status: 204 });
    },
  );
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
