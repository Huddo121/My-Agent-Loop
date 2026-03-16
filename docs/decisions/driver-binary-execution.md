# v1 Driver Architecture

## Context

The server previously prepared a sandbox and executed one harness command directly via `AGENT_RUN_COMMAND`. This made it difficult to insert a stable in-sandbox process that could supervise harness execution and ship logs back to the host while the harness runs.

## Decision

### All runs go through the driver

Every sandboxed execution routes through a dedicated driver process inside the sandbox. There is no separate "direct harness" path. In v1 the driver is a thin process wrapper around one harness execution rather than an in-sandbox orchestration loop.

### Driver packaging via Node SEA

The driver is written in TypeScript/Node, bundled into one CommonJS entrypoint, then packaged as a Linux executable with Node SEA. Bundling first avoids runtime module/file lookup issues inside the SEA binary. The final sandbox image contains the driver binary and does not rely on the workspace source tree at runtime.

### Token-authenticated driver-to-host API

The driver talks to a dedicated internal HTTP API on the host, not MCP. The server generates a random per-run token and passes it as a CLI argument. The driver sends that token in a request header on every log or lifecycle call. The API is internal runtime surface area and is not mixed into MCP handlers.

### Log and lifecycle forwarding scope

The driver's responsibility is deliberately narrow:

1. Accept run metadata, harness command, host API base URL, and driver token as CLI arguments
2. Start the harness command
3. Forward driver and harness logs to the host API while the harness runs
4. Send lifecycle events (harness start, harness exit) to the host API
5. Exit with the harness result

### Task file management outside driver

The driver does not create, read, reconcile, or persist the task file in v1. Any task-file setup remains outside the driver for now. The harness contract may still rely on a local task file, but that file is prepared outside the driver.

## Consequences

- The server generates a random driver token per run, passed as a CLI argument to the driver
- The driver token is validated on every API call and scoped to a single run
- Log delivery goes through the existing logging path: the server accepts HTTP log payloads from the driver, shapes them into a simple server-side format, and writes them to server logs
- Sandbox startup now executes the driver binary as the long-lived process, which then starts the selected harness command
- The driver binary is built during Docker build and copied into the sandbox image
- The driver app remains self-contained in `apps/driver` with its own `package.json`, `tsconfig.json`, and entrypoint
