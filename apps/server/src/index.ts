import { serve } from "@hono/node-server";
import { myAgentLoopApi } from "@mono/api";
import { createHonoServer } from "cerato";
import { adminHandlers } from "./admin/admin-handlers";
import { auth } from "./auth/auth";
import { startMcp } from "./mcp";
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

  // Tear down all running sandbox containers
  await services.sandboxService.stopAllSandboxes();

  console.log("Shutdown complete.");
  process.exit(0);
}

// Register shutdown handlers for various signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));

const app = createHonoServer(
  myAgentLoopApi,
  {
    session: sessionHandlers,
    admin: adminHandlers,
    workspaces: workspacesHandlers,
  },
  services,
);

app.on(["GET", "POST"], "/api/auth/*", async (ctx) => {
  return auth.handler(ctx.req.raw);
});

serve(app, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});

startMcp(services);
