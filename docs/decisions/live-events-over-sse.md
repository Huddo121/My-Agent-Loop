# Live Events Over SSE

## Context

The frontend board is driven by React Query and request-response flows. Task state comes from `useTasks`, project state from projects hooks, and local optimistic updates assume the server response or a later refetch will reconcile the UI. That model works for a single browser tab but does not keep multiple clients in sync when backend state changes—for example, as loop processing picks up tasks, completes them, or reorders them, or when project queue state transitions between `idle`, `processing-*`, `stopping`, and `failed`.

The goal is a general-purpose server-originated event bus that pushes updates to connected browsers. For v1, the transport should be SSE, subscriptions should be tracked on the server, and payloads should contain enough data for the frontend to update local caches directly rather than merely triggering refetches.

## Decision

- **Transport: Server-Sent Events (SSE)**. SSE was chosen over WebSockets or polling because it fits the one-way server-to-client push model, requires no custom framing, and works natively in the browser via `EventSource`. Unlike WebSockets, it reuses HTTP and avoids bidirectional complexity when we only need broadcast. Unlike polling, it delivers updates immediately with minimal overhead.

- **Endpoint outside Cerato**. The live-events endpoint is a raw Hono SSE route at `/api/workspaces/:workspaceId/live-events`, separate from the Cerato API tree. Cerato is the typed request-response contract for standard APIs; LiveEvents is a parallel streaming surface. Forcing long-lived SSE through Cerato would complicate the RPC-style contract and tooling. A dedicated streaming route keeps concerns separated and lets the SSE handler own connection lifecycle, subscription validation, and streaming semantics directly.

- **In-memory process-local subscription registry (v1)**. Subscriptions are held in memory inside the server process. This is explicitly process-local and not suitable for multi-instance fanout. For v1, it keeps the implementation simple and avoids introducing Redis or another broker before horizontal scaling is required. A future Redis-backed pub/sub layer can address cross-instance delivery if needed.

- **Full DTO payloads instead of invalidation-only notices**. Events such as `project.updated` and `task.updated` carry full `ProjectDto` and `TaskDto` payloads that already match frontend expectations. Emitting full payloads lets the frontend patch React Query caches directly without an extra round-trip refetch. Invalidation-only notices would require a refetch per event, adding latency and load. The payload shape stays aligned with existing DTOs used by HTTP handlers.

## Consequences

- One SSE connection per workspace per browser tab, mounted after auth and workspace selection are resolved.
- Subscriptions are declared via repeated `subscription` query params because native `EventSource` only supports GET without a request body.
- Reconnect behavior invalidates relevant queries once; no replay or `Last-Event-ID` in v1.
- Event publication happens at application edges (HTTP handlers, MCP handlers, workflow services) where full DTOs are already assembled, not from repository layers.
- Horizontal scaling will require a shared pub/sub layer before live events can fan out across multiple server instances.
