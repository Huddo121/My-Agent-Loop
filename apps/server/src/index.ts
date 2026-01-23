import { serve } from "@hono/node-server";
import { myAgentLoopApi, type ProjectId } from "@mono/api";
import { createHonoServer } from "cerato";
import { startMcp } from "./mcp";
import { projectsHandlers } from "./projects/projects-handlers";
import { services } from "./services";
import { withNewTransaction } from "./utils/transaction-context";

/** This prevents multiple signals from triggering the shutdown procedure at the same time */
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\nReceived ${signal}, shutting down...`);
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
    projects: projectsHandlers,
  },
  services,
);

serve(app, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});

startMcp(services);

const projectId = "84fdb710-db1c-4fa9-89e3-2d4b1c528e26" as ProjectId;

app.post("/run", async (ctx) => {
  withNewTransaction(services.db, async () => {
    await services.workflowService.processNextTask(projectId);
  });
  return ctx.json({ message: "Processing started" });
});
