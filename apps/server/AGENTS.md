# My Agent Loop Server

## Database migrations

You should not generate database migration files, humans will do that if they accept your work.

## Service wiring

All services are instantiated and wired together in `src/services.ts`. This file is the manual dependency injection composition root. When adding a new service:

1. Add it to the `Services` interface
2. Instantiate it in the module scope of `services.ts`, passing its dependencies
3. Add it to the `services` object at the bottom of the file

Services are accessed in HTTP handlers via `ctx.services` and in MCP handlers via `getMcpServices()`.

## Transaction context

All database reads and writes must be wrapped in `withNewTransaction(db, async () => { ... })` (from `src/utils/transaction-context.ts`). This ensures proper transaction boundaries and consistent reads within a request.

## MCP tool patterns

When adding MCP tools, follow the pattern in `src/projects/projects-mcp-handlers.ts`:

- Define each tool as an object `satisfies McpTool` (from `src/utils/mcp-tool.ts`)
- Export a list typed as `McpTools` (the type erasure helper for `addTools`)
- Access services via `getMcpServices()` (from `src/utils/mcp-service-context.ts`) -- this uses `AsyncLocalStorage`
- For tools that require a project context, use `withRequiredProjectId` from `src/utils/mcp-tool.ts` so the `X-MAL-Project-ID` check is centralized; the inner `execute` receives `(args, context, projectId)`.
- Tool `execute` functions return `string` (JSON-serialized results)
- Register the tools in `src/mcp.ts` via `mcpServer.addTools(...)`

## Security for secrets

Decrypted secrets (e.g., forge tokens) must always be wrapped in `ProtectedString` (from `src/utils/ProtectedString.ts`). This class overrides `toString()`, `toJSON()`, and `inspect()` to prevent accidental logging or serialization. To access the actual value, call `.getSecretValue()` at the exact point it's needed in plaintext. Never log, serialize to JSON, or return tokens in API responses.

Environment variables that are secrets (e.g. API keys for agent harnesses) must be transformed to `ProtectedString` in `src/env.ts` using the `harnessKey()` helper so they are never plain strings in application code.

## Agent harness configuration

See `docs/decisions/agent-harness-configuration.md` for the full design. Key rules:

- To add a new harness, implement `AgentHarness` and add an instance to the `harnesses` array in `src/services.ts`. No other registration is needed.
- Only call `resolveHarnessId` from places that care about resolving the effective configuration.
