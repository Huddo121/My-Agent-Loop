---
name: Live Events Over SSE
overview: Add a general-purpose live event system backed by Server-Sent Events so the server can push typed project and task updates to connected browsers, with server-side subscription tracking and frontend React Query cache updates for the board and queue state.
todos:
  - id: shared-types
    content: Add a new `live-events` module in `packages/api` that exports typed subscriptions and events for the SSE system. Define Zod-backed types for `workspace-projects` and `project-board` subscriptions plus the initial `project.updated` and `task.updated` event payloads, and export them from the package barrel.
    status: completed
  - id: backend-service
    content: Create a server-side `LiveEventsService` that manages in-memory SSE subscribers. It should register and unregister connections, store each connection's workspace id and parsed subscriptions, publish only matching events, and support heartbeats or keepalives for long-lived idle streams.
    status: completed
  - id: sse-endpoint
    content: Add a raw Hono SSE endpoint at `/api/workspaces/:workspaceId/live-events` outside the Cerato API tree. Require an authenticated Better Auth session, return `401` when no session is present, and return `404` when the caller is not a member of the workspace. Accept repeated `subscription` query params, validate them using the shared `packages/api` schemas, reject invalid subscriptions with `400`, and clean up the subscription on abort or disconnect.
    status: completed
  - id: service-wiring
    content: Wire `LiveEventsService` into `apps/server/src/services.ts` and expose it through the server service container so HTTP handlers, MCP handlers, and workflow services can publish live events without reaching into lower-level connection state directly.
    status: completed
  - id: publish-task-events
    content: Publish `task.updated` events at the application edges where task state changes are already assembled into frontend DTOs. Cover task create, update, move, and complete in the HTTP handlers, the MCP task handlers, and workflow-driven task completion in `WorkflowExecutionService`.
    status: completed
  - id: publish-project-events
    content: Publish `project.updated` events whenever project queue state or project metadata changes in ways the UI should reflect live. Cover run start, stop, queue-state transitions in `WorkflowManager`, and project update flows that already return a full project DTO.
    status: completed
  - id: frontend-provider
    content: Add a frontend live-events integration that opens one `EventSource` per workspace tab and mounts inside `CurrentWorkspaceProvider`. Reuse the authenticated app shell and current-workspace selection that now come from `/api/session` and workspace bootstrap, so the provider only mounts once auth and workspace membership have been resolved. Derive subscriptions from the current UI state so the app always listens for workspace project updates and, when a project is selected, board updates for that project.
    status: in-progress
  - id: cache-updates
    content: Add React Query cache helpers for live events and use them in the live-events provider. `project.updated` should patch the projects cache, and `task.updated` should insert, replace, reorder, or remove board tasks based on the task payload and completion state without forcing a full refetch.
    status: pending
  - id: reconnect-behavior
    content: Make the frontend recreate the SSE connection when the subscription set changes and invalidate relevant queries once on reconnect or initial open so the UI can recover from missed events without implementing replay or `Last-Event-ID`. If the stream starts returning auth failures after logout or session expiry, stop reconnecting and let the normal signed-out app flow take over.
    status: pending
  - id: tests
    content: Add tests for shared schema parsing, backend subscription filtering and cleanup, auth and membership enforcement on the SSE endpoint, event publication from task and project mutation paths, and frontend cache update helpers plus reconnect/subscription-change behavior.
    status: pending
  - id: docs
    content: Add a decision record in `docs/decisions/` documenting the `LiveEvents` subsystem, the use of SSE, the in-memory process-local subscription registry, and the typed event payload approach. Update `docs/00-index.md` to link the new decision doc.
    status: pending
isProject: false
---

# Live Events Over SSE

## Context

The frontend board is currently driven by ordinary request-response flows using React Query. Task state comes from `useTasks`, project state comes from the projects hooks/context, and local optimistic behavior in the task queue assumes the server response or a later refetch will eventually reconcile the UI.

That model works for a single browser tab making its own changes, but it does not keep multiple open browsers in sync when backend state changes as loop processing progresses. The first goal of this plan is to let the board update live as tasks are picked up, completed, or reordered and as project queue state changes between `idle`, `processing-*`, `stopping`, and `failed`.

The user wants this to become a general-purpose server-originated event bus, not a board-specific mechanism. For v1, the transport should be SSE, subscriptions should be tracked on the server, and the payloads should contain enough data for the frontend to update local caches directly rather than merely triggering refetches.

## Design Decisions

### Name and scope

Call the subsystem `LiveEvents`. That keeps the product language generic while still allowing SSE to be an implementation detail rather than the public concept.

### Transport

Use native Server-Sent Events over a raw Hono route rather than trying to force this through Cerato. Cerato remains the typed request-response contract for standard APIs, while `LiveEvents` is a parallel streaming surface.

### Subscription model

Subscriptions are declared by the client and tracked by the server per open connection. For v1 there are two subscription types:

- `workspace-projects`
- `project-board` for a specific `projectId`

The client sends subscriptions via repeated query params because native `EventSource` only supports a GET request without a custom request body.

### Event shapes

Keep the first event set intentionally small and use full DTO payloads that already match frontend expectations:

- `project.updated` with a full `ProjectDto`
- `task.updated` with `projectId` and a full `TaskDto`

Do not introduce separate move, completion, or queue-state event variants in v1. The frontend can derive the right cache behavior from the full DTO contents.

### Runtime model

Maintain one SSE connection per workspace per browser tab, mounted at the app level instead of per component. This avoids wasteful duplicate connections and keeps the live event integration centralized.

The live-events provider should only mount after the authenticated app shell has resolved `/api/session` and selected the current workspace from the caller's memberships. It should not participate in the unauthenticated or workspace-bootstrap states.

### Reliability defaults

Do not implement replay or persisted event history in v1. If the stream reconnects, the frontend should invalidate the relevant queries once so the UI catches up from canonical server state.

### Server storage

Keep subscriptions in memory inside the server process for v1. This is explicitly process-local and not suitable for multi-instance fanout; a future Redis-backed pub/sub layer can solve that if horizontal scaling becomes necessary.

## Implementation Guide

### 1. Shared event contracts

Add a new `packages/api/src/live-events/` module that defines:

- a discriminated union for `LiveSubscription`
- a discriminated union for `LiveEventDto`
- Zod schemas to parse both
- helpers to parse subscription strings from query parameters

These contracts should be the single source of truth for both the backend SSE endpoint and the frontend event consumer.

### 2. Backend live event service

Introduce a `LiveEventsService` on the server that owns connection registration and fanout. Each active subscription record should contain:

- a generated connection id
- the `workspaceId`
- the parsed subscription list
- a function that can send an SSE event to that client

The service should expose register, unregister, and publish methods. Publish should filter by workspace and by subscription match before sending.

### 3. SSE endpoint

Add a raw Hono GET route at `/api/workspaces/:workspaceId/live-events`. The handler should:

1. require an authenticated Better Auth session and return `401` if it is missing
2. verify the caller is a member of `:workspaceId` and return `404` if not
3. read all `subscription` query params
4. parse and validate them against the shared schema
5. register the connection with `LiveEventsService`
6. stream SSE messages plus keepalives
7. unregister on abort/disconnect

If subscription parsing fails, return a `400` response immediately.

### 4. Event publication points

Publish `task.updated` after every application-level task mutation path that already knows how to produce a frontend DTO:

- task create/update/move/complete HTTP handlers
- task MCP handlers that mutate task state
- workflow-driven task completion in `WorkflowExecutionService`

Publish `project.updated` after every project mutation path that changes state visible in the UI:

- project update HTTP handler
- run start/stop handlers
- queue-state transitions in `WorkflowManager`

Prefer publishing from these edges rather than from repository classes so the payload uses the fully shaped DTO expected by the frontend and persistence internals remain focused on database work.

### 5. Frontend live event integration

Add a frontend live-events provider or hook mounted inside `CurrentWorkspaceProvider`. It should:

- open one `EventSource` for the current workspace
- always subscribe to `workspace-projects`
- subscribe to the selected project's board only when a current project exists
- recreate the stream when the derived subscription set changes

On stream open or reconnect, invalidate the relevant queries once. On each parsed event, update React Query caches directly.

### 6. React Query cache behavior

Add explicit cache helper functions instead of ad-hoc updates in the SSE event listener.

For `project.updated`:

- patch or insert the project in the workspace projects cache

For `task.updated`:

- update the selected project's task list cache
- insert the task if it is not present and still active
- replace and re-sort it if it exists
- remove it from the active queue cache when `completedOn` is set

Keep optimistic drag-and-drop behavior intact. The live event layer should reconcile with current cache state, not replace the existing local responsiveness.

### 7. Documentation

Add a short decision record describing:

- why SSE was chosen
- why the endpoint sits outside Cerato
- why the first version uses an in-memory subscription registry
- why full DTO payloads are emitted instead of invalidation-only notices

## Testing

Add shared contract tests for:

- valid and invalid subscription parsing
- valid event payload parsing

Add backend tests for:

- workspace and subscription filtering
- `401` for unauthenticated SSE requests
- `404` for non-member workspace SSE requests
- rejection of invalid subscription strings
- cleanup when clients disconnect
- event publication from task and project mutation paths

Add frontend tests for:

- projects cache updates from `project.updated`
- task cache updates from `task.updated`
- removal of completed tasks from the active queue cache
- reconnect invalidation behavior
- stop-retrying behavior after auth loss/logout
- subscription-set changes when the selected project changes

## Out of Scope

- cross-instance live event fanout via Redis or another broker
- persisted event history or replay
- `Last-Event-ID` support
- live streaming of run logs
- a richer event taxonomy than `project.updated` and `task.updated` for v1
