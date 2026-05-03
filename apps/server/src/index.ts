import { serve } from "@hono/node-server";
import { myAgentLoopApi } from "@mono/api";
import { driverApi } from "@mono/driver-api";
import { createHonoServer } from "cerato";
import { adminHandlers } from "./admin/admin-handlers";
import { auth } from "./auth/auth";
import { driverApiHandlers } from "./driver-api/driver-api-handlers";
import { env } from "./env";
import { handleLiveEvents } from "./live-events/live-events-route";
import { startMcp } from "./mcp";
import { services } from "./services";
import { sessionHandlers } from "./session/session-handlers";
import { workspacesHandlers } from "./workspaces/workspaces-handlers";

/**
 * Minimal OAuth consent UI for `@better-auth/oauth-provider`.
 * POST body must include signed `oauth_query` per plugin hooks (see `/oauth2/consent`).
 */
const oauthConsentPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize application</title>
</head>
<body>
  <main style="font-family:system-ui,sans-serif;max-width:32rem;padding:1.5rem">
    <h1 style="font-size:1.125rem">Application access</h1>
    <p>An application is requesting access to your account using your current login session.</p>
    <p style="color:#444;font-size:0.875rem">Requested scopes and client are shown in the query string in the address bar.</p>
    <p>
      <button type="button" id="mal-oauth-continue" style="padding:0.5rem 1rem;font:inherit">
        Continue
      </button>
    </p>
    <p id="mal-oauth-error" style="color:#b00020;font-size:0.875rem"></p>
  </main>
  <script>
    (function () {
      var errEl = document.getElementById("mal-oauth-error");
      var btn = document.getElementById("mal-oauth-continue");
      btn.addEventListener("click", async function () {
        errEl.textContent = "";
        var raw = window.location.search;
        var oauthQuery = raw.startsWith("?") ? raw.slice(1) : raw;
        try {
          var res = await fetch("/api/auth/oauth2/consent", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              accept: true,
              oauth_query: oauthQuery || undefined,
            }),
          });
          var data = await res.json().catch(function () { return null; });
          if (!res.ok) {
            errEl.textContent = (data && (data.message || data.error_description || data.error)) || "Consent request failed.";
            return;
          }
          var next = (data && (data.redirect_uri || data.url)) || null;
          if (next) {
            window.location.href = next;
            return;
          }
          errEl.textContent = "Unexpected response from server.";
        } catch (e) {
          errEl.textContent = "Network error.";
        }
      });
    })();
  </script>
</body>
</html>`;

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

const serverApi = {
  ...myAgentLoopApi,
  ...driverApi,
};

const app = createHonoServer(
  serverApi,
  {
    session: sessionHandlers,
    admin: adminHandlers,
    workspaces: workspacesHandlers,
    internal: driverApiHandlers,
  },
  services,
);

app.on(["GET", "POST"], "/api/auth/*", async (ctx) => {
  return auth.handler(ctx.req.raw);
});

app.get("/oauth/consent", (ctx) => {
  return ctx.html(oauthConsentPageHtml);
});

app.get("/api/workspaces/:workspaceId/live-events", async (ctx) => {
  return handleLiveEvents(ctx, services);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});

startMcp(services);
