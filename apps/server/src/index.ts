import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { serve } from "@hono/node-server";
import { myAgentLoopApi } from "@mono/api";
import { driverApi } from "@mono/driver-api";
import { createHonoServer } from "cerato";
import { adminHandlers } from "./admin/admin-handlers";
import { auth } from "./auth/auth";
import { ensureMalCliClient } from "./auth/oauth-client-seed";
import { driverApiHandlers } from "./driver-api/driver-api-handlers";
import { env } from "./env";
import { handleLiveEvents } from "./live-events/live-events-route";
import { startMcp } from "./mcp";
import { meHandlers } from "./me/me-handlers";
import { services } from "./services";
import { sessionHandlers } from "./session/session-handlers";
import { workspacesHandlers } from "./workspaces/workspaces-handlers";

/** This prevents multiple signals from triggering the shutdown procedure at the same time */
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\nReceived ${signal}, shutting down...`);

  // Stop accepting new jobs and mark any in-progress runs as failed
  await services.backgroundWorkflowProcessor.shutdown();

  // Tear down all running sandboxes — both Docker containers and VM processes
  await services.sandboxService.stopAllSandboxes();
  await services.vmSandboxService.stopAllSandboxes();

  console.log("Shutdown complete.");
  process.exit(0);
}

// Register shutdown handlers for various signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));

const serverApi = {
  ...myAgentLoopApi,
  ...driverApi,
};

const app = createHonoServer(
  serverApi,
  {
    session: sessionHandlers,
    admin: adminHandlers,
    me: meHandlers,
    workspaces: workspacesHandlers,
    internal: driverApiHandlers,
  },
  services,
);

// Unauthenticated liveness check. Consumed by the container healthcheck and the
// production deployer's external HTTPS smoke test, so it must not require a
// session. It is a liveness probe (the process is up and serving), not a deep
// readiness check of Postgres/Redis, and reveals nothing sensitive.
app.get("/api/health", (ctx) => ctx.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", async (ctx) => {
  return auth.handler(ctx.req.raw);
});

const oauthAuthorizationServerMetadata = oauthProviderAuthServerMetadata(auth);
const openIdConfigurationMetadata = oauthProviderOpenIdConfigMetadata(auth);

// Issuer is the app origin; RFC 8414 / OIDC discovery at host root (see `jwt.issuer` in auth.ts).
app.get("/.well-known/oauth-authorization-server", async (ctx) => {
  return oauthAuthorizationServerMetadata(ctx.req.raw);
});

app.get("/.well-known/openid-configuration", async (ctx) => {
  return openIdConfigurationMetadata(ctx.req.raw);
});

app.get("/api/workspaces/:workspaceId/live-events", async (ctx) => {
  return handleLiveEvents(ctx, services);
});

await ensureMalCliClient();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});

startMcp(services);
