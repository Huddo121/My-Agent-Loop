---
name: In-Sandbox Driver Binary
overview: Add a dedicated Node-based driver app that is packaged as a single Linux executable, runs inside every sandbox, invokes the chosen harness, forwards driver and harness logs back to the host through a token-authenticated internal API, and exits with the harness result.
todos:
  - id: driver-app
    content: Reshape `apps/driver` into the v1 driver shell. The app should remain a self-contained CLI program with its own `package.json`, `tsconfig.json`, and entrypoint, but its contract should now be limited to run metadata, harness command, host API base URL, and driver token. Remove task-file-specific CLI/runtime assumptions from this app unless they are still needed outside the driver.
    status: completed
  - id: driver-runtime
    content: Rework `apps/driver/src/` around the v1 runtime responsibilities only. The runtime should parse its CLI inputs, start the harness process, stream stdout/stderr and driver lifecycle events back to the host API, and exit with the harness result. Remove or replace any modules that still assume task-file management, retry loops, progress detection, or other in-sandbox orchestration behavior.
    status: completed
  - id: driver-api
    content: Rework the internal driver API in `apps/server/src/` so it matches the slimmer v1 driver contract. It should stay separate from MCP, authenticate requests with the per-run driver token, and accept the log/lifecycle events the driver needs to send while supervising a harness run. Remove or replace any task-snapshot-oriented API behavior that no longer fits this scope.
    status: pending
  - id: driver-token
    content: Extend run preparation in `apps/server/src/workflow/WorkflowExecutionService.ts` and any supporting services so each run gets a random driver token. Pass that token to the sandboxed driver as a CLI argument and persist it only for the lifetime needed to validate driver API calls. Keep the token scoped to a single run.
    status: completed
  - id: sandbox-startup
    content: Refactor sandbox startup so the driver is always the long-lived process inside the sandbox. Update `apps/server/src/sandbox/lifecycle.sh` and the workflow preparation code so lifecycle bootstraps environment/setup and then executes the driver binary, while the driver itself starts the selected harness command and forwards logs to the host until the harness exits.
    status: pending
  - id: harness-contract
    content: Update the harness preparation flow in `apps/server/src/harness/` so the server still resolves the chosen harness and produces one concrete command for the driver to execute. Keep this contract explicit about what the driver owns versus what server/lifecycle still owns, especially around any task-file setup that remains outside the driver.
    status: pending
  - id: sea-build
    content: Add build tooling for the driver binary. Bundle the v1 driver app into one CommonJS entry file, then package it as a single Linux executable using Node SEA (`node --build-sea`). Wire this into repo scripts and the Docker build so the sandbox image contains the driver binary and it does not rely on the workspace source tree at runtime.
    status: pending
  - id: dockerfile
    content: Update the root `Dockerfile` so it builds the v1 driver binary and copies that Linux executable into the sandbox image alongside the existing harness CLIs. The final image should be able to start the driver directly without needing the workspace source tree inside the container.
    status: pending
  - id: tests
    content: Add tests for the v1 driver and server integration. Cover CLI argument parsing, host API authentication, driver/harness log forwarding, lifecycle event delivery, and the end-to-end contract where the driver exits with the harness result.
    status: pending
  - id: docs
    content: Add a decision record in `docs/decisions/` describing the v1 driver architecture: every run goes through the driver, the driver is packaged as a single Node executable via SEA, and the driver-to-host API is token-authenticated and focused on log/lifecycle forwarding. Update `docs/00-index.md` to link the new decision doc.
    status: pending
isProject: false
---

# In-Sandbox Driver Binary

## Context

Today the server prepares a sandbox and executes one harness command directly via `AGENT_RUN_COMMAND`. That shape makes it awkward to insert a stable in-sandbox process that can supervise harness execution and ship logs back to the host while the harness runs.

The new architecture should route every run through a dedicated driver process inside the sandbox. For v1 the driver should stay deliberately small: launch the harness and forward logs back to the host.

The driver should be implemented as a new Node app in the monorepo and shipped into the Linux sandbox image as a single executable binary.

## Design Decisions

### One execution architecture

All runs go through the driver. There is no separate “direct harness” path. In v1 the driver is a thin process wrapper around one harness execution rather than an in-sandbox orchestration loop.

### Driver-to-host communication

The driver talks to a dedicated internal HTTP API on the host, not MCP. Do not reuse MCP for driver persistence or control flow. The server generates a random per-run token and passes it as a CLI argument. The driver sends that token in a request header on every log or lifecycle call.

### Single executable packaging

The driver is written in TypeScript/Node, bundled into one CommonJS entrypoint, then packaged as a Linux executable with Node SEA. Bundling first avoids runtime module/file lookup issues inside the SEA binary.

### No task-file management in v1

The driver does not create, read, reconcile, or persist the task file in v1. Any task-file setup remains outside the driver for now, and the driver is only responsible for harness process supervision and host log forwarding.

## Implementation Guide

### 1. New `apps/driver` app

Create `apps/driver` as a normal workspace app with:

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- source modules for API client, harness execution, and log forwarding

Keep the app self-contained. If shared contracts are needed, extract them into `packages/api` or a new small shared package rather than importing from `apps/server`.

### 2. Driver process contract

The driver CLI should accept enough information to run independently inside the sandbox:

- run id
- task id
- host API base URL
- driver token
- harness command

The driver should:

1. Start the harness command.
2. Forward driver and harness logs to the host API while the harness runs.
3. Send any final lifecycle update the host needs.
4. Exit with the harness result.

The harness contract may still rely on a local task file, but in v1 that file is prepared outside the driver.

### 3. Server-side driver API

Add a dedicated internal endpoint set under the server app for:

- receiving driver and harness log events
- receiving basic lifecycle events such as harness start and harness exit

Use a header-based token check against the current run. This API is internal runtime surface area and should not be mixed into MCP handlers.

### 4. Sandbox startup flow

Refactor workflow preparation and `lifecycle.sh` so the container starts the driver binary instead of directly executing a harness command. The driver should inherit any environment the harness CLIs need and remain the long-lived runtime entrypoint while it supervises the harness process and forwards logs.

### 5. Packaging

Add a build step that:

1. Bundles the driver app into one CommonJS file.
2. Builds a SEA blob and Linux executable.
3. Copies the executable into the sandbox image during `docker build`.

### 6. Testing

Add focused unit tests around:

- API auth
- log event serialization/forwarding
- harness exit handling

Also add service/integration coverage that proves the server can start a sandboxed driver run and validate its token-authenticated log traffic.

## Out of Scope

- Reworking the user-facing task/project UI
- Changing MCP tool behavior for normal agent usage
- In-sandbox orchestration loops, retries, or progress detection
- Driver-managed task-file creation, persistence, or reconciliation
- Persisting rich per-iteration logs beyond what the current run/log system already supports
- Multi-sandbox or parallel subtask execution
