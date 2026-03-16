---
name: In-Sandbox Driver Binary
overview: Add a dedicated Node-based driver app that is packaged as a single Linux executable, runs inside every sandbox, owns the local task file, invokes the chosen harness, syncs progress back to the host through a token-authenticated internal API, and exits with the overall run result.
todos:
  - id: driver-app
    content: Create a new workspace app at `apps/driver`. Add its `package.json`, `tsconfig.json`, and source entrypoint. Keep it self-contained and avoid importing server internals directly unless a type or helper is intentionally moved to a shared package. The app should be a CLI program that accepts run metadata, harness command, task file path, host API base URL, and driver token as arguments.
    status: completed
  - id: driver-runtime
    content: Implement the driver runtime in `apps/driver/src/`. Split it into small modules for CLI parsing, host API client, task-file loading/saving, harness process execution, retry handling, and progress detection. The runtime should support both single-task runs and subtask runs through the same loop, with subtask-aware behavior enabled when the task file contains subtasks.
    status: completed
  - id: driver-api
    content: Add a dedicated internal driver API to `apps/server/src/` for driver-to-host communication. It should be separate from MCP and support reading the current canonical task state and persisting a task snapshot after each iteration. Authenticate requests with a random per-run token sent in a request header. Reject missing or invalid tokens.
    status: completed
  - id: driver-token
    content: Extend run preparation in `apps/server/src/workflow/WorkflowExecutionService.ts` and any supporting services so each run gets a random driver token. Pass that token to the sandboxed driver as a CLI argument and persist it only for the lifetime needed to validate driver API calls. Keep the token scoped to a single run.
    status: completed
  - id: sandbox-startup
    content: Refactor sandbox startup so the driver is always the long-lived process inside the sandbox. Update `apps/server/src/sandbox/lifecycle.sh` and the workflow preparation code so lifecycle bootstraps environment/setup and then executes the driver binary, while the driver itself spawns the selected harness command for each iteration.
    status: pending
  - id: harness-contract
    content: Update harness preparation types in `apps/server/src/harness/` so the server still resolves the chosen harness and provides one concrete harness command, but that command is now executed by the driver rather than directly by the lifecycle script. Add support for a driver-oriented prompt variant that tells the harness to read the task file and make progress on the next available TODO.
    status: pending
  - id: sea-build
    content: Add build tooling for the driver binary. Bundle `apps/driver` into one CommonJS entry file, then package it as a single Linux executable using Node SEA (`node --build-sea`). Wire this into repo scripts and the Docker build so the sandbox image contains the driver binary. Prefer a fully bundled entry so the SEA binary does not rely on workspace file resolution at runtime.
    status: pending
  - id: dockerfile
    content: Update the root `Dockerfile` to build the new driver app and copy the Linux driver executable into the sandbox image. Preserve installation of the harness CLIs already present in the image. The final image should be able to start the driver without needing the workspace source tree inside the container.
    status: pending
  - id: tests
    content: Add tests for the driver app and server integration. Cover CLI argument parsing, host API auth, task snapshot persistence, no-progress detection, retry/reset behavior, and the end-to-end contract where the driver exits successfully after work is completed or non-zero after retries are exhausted.
    status: pending
  - id: docs
    content: Add a decision record in `docs/decisions/` describing why every run now goes through a driver app, why the driver is packaged as a single Node executable via SEA, and how the driver-to-host token-authenticated API works. Update `docs/00-index.md` to link the new decision doc.
    status: pending
isProject: false
---

# In-Sandbox Driver Binary

## Context

Today the server prepares a sandbox and executes one harness command directly via `AGENT_RUN_COMMAND`. That shape makes repeated in-sandbox orchestration awkward because the server has to own loop state, file updates, and retry semantics across the Docker boundary.

The new architecture should route every run through a dedicated driver process inside the sandbox. This gives one place to manage task-file state, prompt selection, harness retries, and communication back to the host.

The driver should be implemented as a new Node app in the monorepo and shipped into the Linux sandbox image as a single executable binary.

## Design Decisions

### One execution architecture

All runs go through the driver. There is no separate “direct harness” path. Tasks without subtasks still use the same driver, but the loop will only need one successful iteration.

### Driver-to-host communication

The driver talks to a dedicated internal HTTP API on the host, not MCP. Do not reuse MCP for driver persistence or control flow. The server generates a random per-run token and passes it as a CLI argument. The driver sends that token in a request header on every sync call.

### Single executable packaging

The driver is written in TypeScript/Node, bundled into one CommonJS entrypoint, then packaged as a Linux executable with Node SEA. Bundling first avoids runtime module/file lookup issues inside the SEA binary.

### Local task file ownership

The driver owns a writable local task file inside the sandbox. That in-sandbox file is the authoritative working state during execution. The host copy is only a persisted mirror updated after each iteration. The driver reads the local file before and after each harness iteration and syncs snapshots back to the host after each iteration.

## Implementation Guide

### 1. New `apps/driver` app

Create `apps/driver` as a normal workspace app with:

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- source modules for API client, task parsing, progress detection, retry handling, and harness execution

Keep the app self-contained. If shared contracts are needed, extract them into `packages/api` or a new small shared package rather than importing from `apps/server`.

### 2. Driver process contract

The driver CLI should accept enough information to run independently inside the sandbox:

- run id
- task id
- task file path
- host API base URL
- driver token
- harness command
- retry limit

The driver should:

1. Load the local task file.
2. Run the harness command.
3. Re-read the task file.
4. Decide whether forward progress was made.
5. Sync the latest snapshot to the host API.
6. Restore the task file snapshot and retry when an iteration fails to make progress.
7. Exit `0` only when the run is complete.

The harness itself should be instructed to operate on the local task file, not to use MCP to persist task/subtask progress.

### 3. Server-side driver API

Add a dedicated internal endpoint set under the server app for:

- reading canonical task state
- persisting a task snapshot from the driver after each iteration

Use a header-based token check against the current run. This API is internal runtime surface area and should not be mixed into MCP handlers.

### 4. Sandbox startup flow

Refactor workflow preparation and `lifecycle.sh` so the container starts the driver binary instead of directly executing a harness command. The driver should inherit any environment the harness CLIs need, and should be the only long-lived runtime entrypoint inside the sandbox.

### 5. Packaging

Add a build step that:

1. Bundles the driver app into one CommonJS file.
2. Builds a SEA blob and Linux executable.
3. Copies the executable into the sandbox image during `docker build`.

### 6. Testing

Add focused unit tests around:

- progress detection
- retry accounting
- API auth
- task snapshot serialization
- harness exit handling

Also add service/integration coverage that proves the server can start a sandboxed driver run and validate its token-authenticated sync traffic.

## Out of Scope

- Reworking the user-facing task/project UI
- Changing MCP tool behavior for normal agent usage
- Persisting rich per-iteration logs beyond what the current run/log system already supports
- Multi-sandbox or parallel subtask execution
