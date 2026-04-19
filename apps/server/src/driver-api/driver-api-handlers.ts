import {
  badUserInput,
  notFound,
  ok,
  unauthenticated,
} from "@mono/api";
import { DRIVER_TOKEN_HEADER, type DriverApi } from "@mono/driver-api";
import type { HonoHandlersFor } from "cerato";
import { type RunId, runIdSchema } from "../runs/RunId";
import type { Run } from "../runs/RunsService";
import type { Services } from "../services";
import type { Result } from "../utils/Result";
import { withNewTransaction } from "../utils/transaction-context";

type DriverApiServices = Pick<
  Services,
  "db" | "driverRunTokenStore" | "runsService" | "logger"
>;

export const driverApiHandlers: HonoHandlersFor<
  ["internal"],
  DriverApi["internal"],
  DriverApiServices
> = {
  driver: {
    runs: {
      ":runId": {
        logs: async (ctx) => {
          const requestResult = await getAuthenticatedRun(
            ctx.services,
            ctx.hono.req.param("runId"),
            ctx.hono.req.header(DRIVER_TOKEN_HEADER),
          );
          if (requestResult.success === false) {
            return requestResult.error;
          }

          const { runId } = requestResult.value;

          const logMessage = `[driver:${runId}] ${ctx.body.stream}: ${ctx.body.message}`;
          if (ctx.body.stream === "stderr") {
            ctx.services.logger.error(logMessage);
          } else {
            ctx.services.logger.info(logMessage);
          }

          return ok({ ok: true });
        },
        lifecycle: async (ctx) => {
          const requestResult = await getAuthenticatedRun(
            ctx.services,
            ctx.hono.req.param("runId"),
            ctx.hono.req.header(DRIVER_TOKEN_HEADER),
          );
          if (requestResult.success === false) {
            return requestResult.error;
          }

          const { runId } = requestResult.value;

          if (ctx.body.kind === "harness-starting") {
            ctx.services.logger.info(
              `[driver:${runId}] Harness starting: ${ctx.body.harnessCommand}`,
            );
          } else {
            ctx.services.logger.info(
              `[driver:${runId}] Harness exited with code ${ctx.body.exitCode}${ctx.body.signal === null ? "" : ` (${ctx.body.signal})`}`,
            );
          }

          return ok({ ok: true });
        },
      },
    },
  },
};

type DriverRequestFailure =
  | ReturnType<typeof badUserInput>
  | ReturnType<typeof notFound>
  | ReturnType<typeof unauthenticated>;

async function getAuthenticatedRun(
  services: DriverApiServices,
  rawRunId: string,
  driverToken: string | undefined,
): Promise<Result<{ run: Run; runId: RunId }, DriverRequestFailure>> {
  const runIdResult = parseRunId(rawRunId);
  if (runIdResult.success === false) {
    return runIdResult;
  }

  const authResult = authenticateDriverRequest(
    services,
    runIdResult.value,
    driverToken,
  );
  if (authResult.success === false) {
    return authResult;
  }

  const runResult = await getRun(services, runIdResult.value);
  if (runResult.success === false) {
    return runResult;
  }

  return {
    success: true,
    value: {
      run: runResult.value,
      runId: runIdResult.value,
    },
  };
}

function parseRunId(
  rawRunId: string,
): Result<RunId, ReturnType<typeof badUserInput>> {
  const result = runIdSchema.safeParse(rawRunId);
  if (!result.success) {
    return { success: false, error: badUserInput("Run ID is invalid.") };
  }

  return { success: true, value: result.data };
}

function authenticateDriverRequest(
  services: DriverApiServices,
  runId: RunId,
  driverToken: string | undefined,
): Result<void, ReturnType<typeof unauthenticated>> {
  if (driverToken === undefined || driverToken.length === 0) {
    return {
      success: false,
      error: unauthenticated("Driver token is required."),
    };
  }

  if (!services.driverRunTokenStore.isValidToken(runId, driverToken)) {
    return {
      success: false,
      error: unauthenticated("Driver token is invalid."),
    };
  }

  return { success: true, value: undefined };
}

async function getRun(
  services: DriverApiServices,
  runId: RunId,
): Promise<Result<Run, ReturnType<typeof notFound>>> {
  const run = await withNewTransaction(services.db, () =>
    services.runsService.getRun(runId),
  );

  if (run === undefined) {
    return { success: false, error: notFound("Run not found.") };
  }

  return { success: true, value: run };
}
