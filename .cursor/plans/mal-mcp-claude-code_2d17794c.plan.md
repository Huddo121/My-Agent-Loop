---
name: Expose MAL MCP to Claude Code
overview: Publish a second, public MCP endpoint alongside the existing internal one in `apps/server` so Claude Code users can reach MAL tools (tasks, projects, forge) over HTTP. The internal MCP that the OpenCodeHarness uses (port 3050, header-based project/task scoping, no auth) stays unchanged. The new public MCP authenticates Claude Code via the existing Better Auth OAuth provider — Claude Code is registered as a new public PKCE client — and exposes arg-driven tools that take `projectId` (and `taskId` where relevant) on every call. Both MCPs delegate to the same service-layer functions; only the scoping and auth differ.
todos:
  - id: public-mcp-scaffold
    content: Create `apps/server/src/public-mcp/public-mcp.ts` with a new `FastMCP<PublicMcpSessionData>` instance bound to a configurable port (default `3051`) and path `/mcp`. Session data carries `userId` only — no project/task. Add `startPublicMcp(services)` and call it from `apps/server/src/index.ts` next to the existing `startMcp(services)` (around line 90). Add `PUBLIC_MCP_PORT` to `apps/server/src/env.ts` (default 3051).
    status: pending
  - id: bearer-auth-callback
    content: In `apps/server/src/public-mcp/public-mcp-auth.ts`, verify `Authorization: Bearer <jwt>` from the FastMCP `authenticate` callback using the existing `requireOAuthBearer` flow in `apps/server/src/auth/oauth-bearer.ts`. The current helper looks Hono-shaped — if it cannot be invoked from a non-Hono context, factor a pure JWT-verify-against-JWKS function out of it and call that from both places. Return `{ userId }` in `PublicMcpSessionData` on success; throw on missing/invalid token so FastMCP returns 401 with `WWW-Authenticate: Bearer resource_metadata=<url>` (set the header explicitly if FastMCP doesn't add it).
    status: pending
  - id: oauth-protected-resource-metadata
    content: Expose `/.well-known/oauth-protected-resource` returning a JSON document that names the existing Better Auth issuer (`env.APP_BASE_URL`) as the authorization server, lists supported scopes, and points back at the public MCP `resource` URL. Mount the route on the existing main Hono app (the route just needs to be reachable from Claude Code at the same origin clients hit for the MCP endpoint).
    status: pending
  - id: register-claude-code-oauth-client
    content: In `apps/server/src/auth/auth.ts`, register a second OAuth client (`claude-code-mcp`) under the existing `oauthProvider` plugin alongside the `mal-cli` client. Configure as a public PKCE client and allow the loopback redirect URI shapes Claude Code uses (`http://127.0.0.1:*/...`). If Better Auth requires concrete URIs, accept the small published set and add a follow-up to enable Dynamic Client Registration if needed. Keep `validAudiences: [issuer]` unless adding a dedicated MCP resource audience proves cleaner; whatever is chosen, assert it inside the FastMCP authenticate callback.
    status: pending
  - id: tools-tasks
    content: Mirror the existing task tools as arg-driven wrappers in `apps/server/src/public-mcp/tool-wrappers/tasks.ts`. For `getTasks`, `addTask`, `markTaskCompleted`, `createSubtask`, `updateSubtask`, write Zod schemas that include `projectId` (and `taskId` where relevant) as explicit args, then delegate to the same underlying service functions used by `apps/server/src/tasks/tasks-mcp-handlers.ts`. Tools that already resolve `projectId` from the DB via `getProjectIdForTask` (e.g. subtask updates) keep that behavior — no extra arg. Do not modify the existing internal handlers.
    status: pending
  - id: tools-projects
    content: Add `getProject` (an arg-driven sibling of the existing `getCurrentProject`) to `apps/server/src/public-mcp/tool-wrappers/projects.ts`. The wrapper takes `projectId` as an arg, skips `withRequiredProjectId`, and calls the same project service used by `apps/server/src/projects/projects-mcp-handlers.ts`.
    status: pending
  - id: tools-forge
    content: Mirror all 8 forge tools (`createMergeRequest`, `getMergeRequest`, `listMergeRequests`, `addMergeRequestComment`, `listCiPipelines`, `getCiPipeline`, `listCiPipelineJobs`, `getCiJobLog`) as arg-driven wrappers in `apps/server/src/public-mcp/tool-wrappers/forge.ts`, each accepting `projectId` as an arg. Where a forge service helper currently embeds `withRequiredProjectId`, add a sibling helper that takes `ProjectId` directly so the public wrappers can call it without disturbing the internal handler call sites in `apps/server/src/forge/forge-mcp-handlers.ts`.
    status: pending
  - id: authorization-on-projects
    content: After authenticating the user, the public wrappers must enforce that the user has access to the supplied `projectId` before delegating to the service. Audit the existing project/task/forge service entry points to see if user-scoped access is already enforced (likely via the project repository). If yes, document the assumption in `public-mcp.ts`; if not, add a single shared guard helper in `apps/server/src/public-mcp/` that loads the project for a `userId` and throws an MCP error when the user lacks access. Wire every wrapper through it.
    status: pending
  - id: expose-port-3051
    content: Expose port `3051` in `docker-compose.yml` for local dev and in any prod deploy surface that gets stood up (none in the repo today). Keep port `3050` (internal MCP) unexposed. Verify `host.docker.internal` reachability for the harness still resolves to 3050 and is not affected.
    status: pending
  - id: readme-claude-code-setup
    content: Document the Claude Code wiring in `apps/server/README.md` (or root README — match the existing convention). Show `claude mcp add --transport http mal https://<mal-host>/mcp`, explain the OAuth flow (browser opens to MAL login, user authenticates via magic link, consents, Claude Code stores the token), and call out that every tool call requires a `projectId` argument so Claude Code agents will ask the user for it when needed.
    status: pending
  - id: e2e-verification
    content: Manual verification. (1) Harness path on 3050 unchanged — run a normal MAL task and confirm OpenCode still hits the internal MCP and tools work. (2) Claude Code happy path on 3051 — `pnpm dev`, then in a separate clone `claude mcp add --transport http mal http://localhost:3051/mcp`, trigger a MAL tool, complete the OAuth login, confirm the tool returns. (3) Auth boundary — `curl http://localhost:3051/mcp` without a token returns 401 with `WWW-Authenticate: Bearer resource_metadata=...`. (4) Discovery — `curl http://localhost:3051/.well-known/oauth-protected-resource` (or wherever it's mounted) returns valid JSON pointing at the Better Auth issuer.
    status: pending
isProject: false
---

# Expose MAL MCP to Claude Code

## Context

The MAL backend already runs an MCP server (`apps/server/src/mcp.ts`) using FastMCP HTTP Stream on port 3050. It is consumed exclusively by `OpenCodeHarness`, which sets `X-MAL-Project-ID` / `X-MAL-Task-ID` headers per harness run and points the OpenCode CLI at `http://host.docker.internal:3050/mcp`. The endpoint has no user authentication and project/task scope is implicit per session.

We want Claude Code users (people running `claude` outside the harness, against their own MAL account) to be able to call MAL tools — creating tasks, fetching merge requests, listing CI jobs, etc. Claude Code supports remote HTTP MCP servers and the MCP OAuth 2.1 flow. The cleanest approach is a second, **public**, **authenticated** MCP endpoint where each tool call carries its own `projectId` (and `taskId` where relevant) instead of relying on session headers.

The internal MCP must keep working unchanged for the harness path.

## Design Decisions

### A second MCP server, not a refactor of the existing one

The internal MCP is wired specifically for the harness lifecycle: header-based scoping is set once, no auth is needed inside the trust boundary, and every forge/projects tool uses `withRequiredProjectId` (`apps/server/src/forge/forge-mcp-handlers.ts`, `apps/server/src/projects/projects-mcp-handlers.ts`). Refactoring those tools to per-call args would force corresponding changes in `OpenCodeHarness` and add no value for the harness path.

A second FastMCP instance in `apps/server/src/public-mcp/`, on its own port (default 3051), keeps the two surfaces independent. Both delegate to the same service-layer functions — only the wrappers differ.

### OAuth via the existing Better Auth provider

`apps/server/src/auth/auth.ts` already configures Better Auth's `oauthProvider` plugin and signs JWTs via the JWT plugin. The `mal-cli` client is the existing example of a public PKCE client. We register a second client (`claude-code-mcp`) the same way and lean on the existing `requireOAuthBearer` (`apps/server/src/auth/oauth-bearer.ts`) for token verification inside the FastMCP `authenticate` callback. No new auth machinery is introduced.

Discovery is handled by exposing `/.well-known/oauth-protected-resource` on the main app, pointing at the existing issuer. Better Auth already serves `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`.

### Per-call `projectId` / `taskId` args

The public tools take `projectId` (and `taskId` where the underlying operation needs it) as explicit Zod-schema args. Claude Code agents will ask the user when they don't know the value. This matches how Claude Code's tool-call UX works and is the right shape for an externally consumed API.

A handful of operations (e.g. subtask updates) already resolve `projectId` from the DB via `getProjectIdForTask`. Those wrappers keep that behavior — taking only `taskId` — to avoid forcing redundant args.

### Authorization

Authentication says "this user signed in." The wrappers also need to check that the authenticated user has access to the `projectId` they passed. The existing service-layer code likely enforces this via the project repository (most multi-tenant repos do). The plan audits this and either documents the assumption or adds a single shared guard helper used by every public wrapper — never both.

## Implementation Guide

### 1. Scaffold

```
apps/server/src/public-mcp/
  public-mcp.ts                    # FastMCP instance + startPublicMcp(services)
  public-mcp-auth.ts               # authenticate callback (Bearer JWT verify)
  authorize-project.ts             # shared `assertUserHasProject(userId, projectId)` helper (if needed)
  tool-wrappers/
    tasks.ts
    projects.ts
    forge.ts
```

`apps/server/src/index.ts` calls both `startMcp(services)` and `startPublicMcp(services)` at startup. `apps/server/src/env.ts` adds `PUBLIC_MCP_PORT` (default 3051).

### 2. Auth on the public MCP

```ts
const publicMcpServer = new FastMCP<PublicMcpSessionData>({
  name: "My Agent Loop (public)",
  version: "0.0.1",
  authenticate: async (request) => {
    const userId = await verifyBearerJwt(request.headers.authorization); // throws on failure
    return { userId };
  },
});
```

`verifyBearerJwt` is whatever pure helper falls out of `requireOAuthBearer`. On failure, the thrown error must produce a 401 with `WWW-Authenticate: Bearer resource_metadata=<protected-resource-url>`.

### 3. Tool wrappers delegate to services

Each public wrapper looks like:

```ts
{
  name: "addTask",
  parameters: z.object({ projectId: z.string(), title: z.string(), /* ... */ }),
  execute: async ({ projectId, title, /* ... */ }, { session }) => {
    await assertUserHasProject(session.userId, projectId);
    return tasksService.addTask({ projectId, title, /* ... */ });
  },
}
```

The `tasksService.addTask` (or equivalent) is the same function the internal `tasks-mcp-handlers.ts` already calls. No business logic moves; only argument plumbing changes.

### 4. Claude Code OAuth client

`apps/server/src/auth/auth.ts` already declares `mal-cli` as the existing OAuth client. Add a second entry for `claude-code-mcp`:

- Public client, PKCE required.
- Redirect URIs: the loopback shapes Claude Code uses for MCP OAuth.
- Audience: the existing issuer (or a dedicated MCP audience if Better Auth makes it ergonomic).

The frontend OAuth consent route already exists (`/oauth/consent`), so the consent UX comes for free.

### 5. Discovery and headers

`/.well-known/oauth-protected-resource` returns:

```json
{
  "resource": "https://<mal-host>/mcp",
  "authorization_servers": ["https://<mal-host>"],
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "bearer_methods_supported": ["header"]
}
```

When auth fails, the FastMCP response must carry:

```
WWW-Authenticate: Bearer resource_metadata="https://<mal-host>/.well-known/oauth-protected-resource"
```

Claude Code uses these together to start the OAuth dance.

## Critical Files

- `apps/server/src/mcp.ts` — internal MCP, **read-only reference**.
- `apps/server/src/index.ts` — add `startPublicMcp(services)` next to `startMcp`.
- `apps/server/src/public-mcp/*` — **new** module (see scaffold above).
- `apps/server/src/auth/oauth-bearer.ts` — reuse / refactor `requireOAuthBearer` so the JWT-verify half is callable from the FastMCP authenticate callback.
- `apps/server/src/auth/auth.ts` — register the `claude-code-mcp` OAuth client.
- `apps/server/src/env.ts` — add `PUBLIC_MCP_PORT` (default 3051).
- `apps/server/src/tasks/tasks-mcp-handlers.ts`, `apps/server/src/projects/projects-mcp-handlers.ts`, `apps/server/src/forge/forge-mcp-handlers.ts` — **read** to identify the underlying service entry points to reuse; do not modify.
- `docker-compose.yml` — expose 3051 for local dev.
- `apps/server/README.md` (or root README) — Claude Code setup docs.

## Out of Scope

- Refactoring the internal MCP to share wrappers with the public one beyond the service layer.
- Dynamic Client Registration (DCR) — track as a follow-up if Claude Code's pre-registered client setup proves awkward.
- Per-tool permission scopes beyond "user is authenticated and owns the project."
- Exposing the existing internal MCP (port 3050) externally.
