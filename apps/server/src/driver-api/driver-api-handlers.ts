import { notFound, ok, unauthenticated } from "@mono/api";
import { DRIVER_TOKEN_HEADER, type DriverApi } from "@mono/driver-api";
import type { HonoHandlersFor } from "cerato";
import type { RunId } from "../runs/RunId";
import type { Run } from "../runs/RunsService";
import type { Services } from "../services";
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
          const runId = ctx.hono.req.param("runId") as RunId;

          const authFailure = authenticateDriverRequest(
            ctx.services,
            runId,
            ctx.hono.req.header(DRIVER_TOKEN_HEADER),
          );
          if (authFailure !== null) {
            return authFailure;
          }

          const run = await getRun(ctx.services, runId);
          if (run === undefined) {
            return notFound("Run not found.");
          }

          const logMessage = `[driver:${runId}] ${ctx.body.stream}: ${ctx.body.message}`;
          if (ctx.body.stream === "stderr") {
            ctx.services.logger.error(logMessage);
          } else {
            ctx.services.logger.info(logMessage);
          }

          return ok({ ok: true });
        },
        lifecycle: async (ctx) => {
          const runId = ctx.hono.req.param("runId") as RunId;

          const authFailure = authenticateDriverRequest(
            ctx.services,
            runId,
            ctx.hono.req.header(DRIVER_TOKEN_HEADER),
          );
          if (authFailure !== null) {
            return authFailure;
          }

          const run = await getRun(ctx.services, runId);
          if (run === undefined) {
            return notFound("Run not found.");
          }

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

async function getRun(
  services: DriverApiServices,
  runId: RunId,
): Promise<Run | undefined> {
  return withNewTransaction(services.db, () =>
    services.runsService.getRun(runId),
  );
}
