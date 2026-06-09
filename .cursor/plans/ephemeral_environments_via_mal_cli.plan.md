---
name: Ephemeral Environments via MAL CLI
overview: Add project-scoped, user-owned ephemeral development environments provisioned by the MAL server through Daytona, with CLI commands to create, list, inspect, SSH into, open in Cursor, stop, and delete them.
todos:
  - id: environment-api-contract
    content: Add the branded environment ID, lifecycle DTOs, create/connect request and response schemas, and user-owned environment endpoints under `packages/api/src/environments/`; compose them into `meApi` and export them from `packages/api/src/index.ts`.
    status: pending
  - id: environment-persistence
    content: Add the `development_environments` table and enums to `apps/server/src/db/schema.ts`, then implement `EnvironmentRepository` plus its database and fake implementations. Store MAL ownership/lifecycle metadata only; never store Daytona API keys or SSH access tokens.
    status: pending
  - id: provider-interface
    content: Create the provider-neutral `EphemeralEnvironmentProvider` contract and result/error types under `apps/server/src/environments/`, covering create, inspect, stop, delete, execute/bootstrap, and short-lived SSH access.
    status: pending
  - id: daytona-provider
    content: Add `@daytona/sdk` to `@mono/server` with pnpm and implement `DaytonaEnvironmentProvider` using a configured snapshot, target, labels, ephemeral auto-delete, auto-stop, Git/process APIs, and `createSshAccess`; map SDK failures into the provider result union.
    status: pending
  - id: environment-service
    content: Implement `EnvironmentService` orchestration for creation, bootstrap, state refresh, connect access, stop, and delete. Enforce project membership and per-user ownership at handlers, clean up partially created sandboxes, and reconcile provider state into the MAL record.
    status: pending
  - id: environment-http-handlers
    content: Add authenticated user-owned environment handlers and tests under `apps/server/src/environments/`, register them under the Cerato `me` API tree, authorize the requested project on create, and use the standard 400/401/404/500 helpers.
    status: pending
  - id: server-configuration
    content: Add validated Daytona and environment policy settings to `apps/server/src/env.ts`, wire the repository/provider/service in `apps/server/src/services.ts`, and document operator prerequisites without exposing provider credentials to the CLI.
    status: pending
  - id: cli-api-client
    content: Refactor `apps/mal-cli/src/api.ts` only as needed to share authenticated request/error parsing, then add typed functions for environment list/create/get/connect/stop/delete responses parsed with the shared API schemas.
    status: pending
  - id: cli-environment-commands
    content: Add `mal env create|list|status|ssh|cursor|stop|delete` commands, deterministic project/environment resolution, table and JSON output, system SSH execution, and Cursor launch through a temporary isolated SSH config.
    status: pending
  - id: cli-tests
    content: Add Vitest coverage for argument parsing, API failures, environment selection, SSH invocation, Cursor invocation, temporary file permissions, and cleanup; update the CLI Moon/package test configuration if needed using repository tooling.
    status: pending
  - id: docs-and-decision
    content: Add a decision record for Daytona-backed ephemeral environments, update `docs/00-index.md` only if a new top-level entry is required, and update `apps/mal-cli/AGENTS.md`/README usage with command examples, security behavior, TTL semantics, and operator setup.
    status: pending
  - id: end-to-end-verification
    content: Run focused tests plus `pnpm typecheck` and `pnpm check`, build the MAL SEA binary, and manually verify create -> SSH -> Cursor -> stop/delete against a Daytona test account, including expiration and partial-failure cleanup.
    status: pending
isProject: false
---

# Ephemeral Environments via the MAL CLI

## Goal

Let an authenticated MAL user create a temporary remote development environment for an existing MAL project, work in it through ordinary OpenSSH or Cursor Remote SSH, and remove it through the `mal` CLI.

The first implementation should support this workflow:

```bash
mal env create --project PRJ
mal env list
mal env ssh <environment-id>
mal env cursor <environment-id>
mal env stop <environment-id>
mal env delete <environment-id>
```

`mal env create` provisions the environment through the MAL server, clones the project's configured repository into `/workspace/repo`, runs the repository's existing `.agent-loop/setup.sh` when present, and prints the environment ID and connect commands. `mal env ssh` opens an interactive system SSH session. `mal env cursor` launches the local Cursor application against the same environment as a Remote SSH workspace.

## Existing System Context

- `apps/mal-cli` is currently an OAuth helper with `login`, `logout`, `status`, and provider credential commands. It already obtains and refreshes a MAL OAuth bearer token in `apps/mal-cli/src/api.ts` and stores only MAL authentication state in the user's config directory.
- Public API types are defined with Zod and Cerato in `packages/api`. Project-scoped routes are composed under `workspaces/:workspaceId/projects/:projectId` in `packages/api/src/projects/projects-api.ts`.
- Server handlers use authenticated sessions or OAuth bearer identity, `WorkspaceMembershipsService` for authorization, service interfaces for domain behavior, Drizzle repositories for persistence, and standard error helpers from `@mono/api`.
- A project already owns the repository URL and an encrypted forge token. `ForgeSecretRepository.getForgeSecret(projectId)` decrypts the token only inside the server process.
- The existing `SandboxService` and `WorkflowExecutionService` are designed for short-lived autonomous task runs on the MAL host. They are not a suitable record or lifecycle model for a human-operated remote workspace: they have no user ownership, reconnect semantics, remote provider identity, or durable lifecycle record.
- The separate VM sandbox plan in `.cursor/plans/vm_sandbox_support_be2b8dd0.plan.md` concerns the runtime for automated MAL runs. Do not couple this feature to that implementation. Both can eventually share lower-level concepts, but an ephemeral development environment has a different lifecycle and security boundary.

## Research Summary

Research was checked against current official Daytona material on June 9, 2026:

- Daytona exposes a TypeScript SDK and REST API for creating isolated sandboxes from snapshots or OCI/Docker-compatible images: <https://www.daytona.io/docs/en/typescript-sdk/>
- Creation parameters include labels, target/region, resources, `ephemeral`, `autoStopInterval`, and `autoDeleteInterval`: <https://www.daytona.io/docs/en/typescript-sdk/daytona/>
- Sandboxes expose start, stop, delete, refresh, process, filesystem, and short-lived `createSshAccess(expiresInMinutes)` operations: <https://www.daytona.io/docs/en/typescript-sdk/sandbox/>
- Daytona documents SSH access for ordinary terminals and IDEs including Cursor, using expiring, revocable tokens: <https://www.daytona.io/dotfiles/ssh-access-on-daytona>
- Daytona's Git API supports cloning private repositories with a username and token without requiring credentials to be embedded in the repository URL: <https://www.daytona.io/docs/en/git-operations/>
- Daytona supports managed, self-hosted, and customer-managed compute deployments. Its open-source stack contains a dedicated SSH gateway: <https://github.com/daytonaio/daytona> and <https://github.com/daytonaio/daytona/blob/main/apps/docs/src/content/docs/en/oss-deployment.mdx>

### Alternatives considered

- **Raw cloud VMs (Hetzner, EC2, DigitalOcean):** They provide standard SSH and full control, but MAL would need to own image building, cloud-init, networking, firewall rules, host key management, idle detection, cleanup jobs, and provider-specific instance state. This is substantially more infrastructure than the requested feature needs.
- **Fly Machines:** Machines are fast and have provider CLI SSH support, but standard IDE SSH requires additional Fly networking/credential machinery and creates a stronger dependency on `flyctl` at the client edge.
- **E2B:** It is a good agent sandbox platform, but Daytona has a directly documented SSH-token flow for Cursor and explicit lifecycle controls suitable for human remote workspaces.
- **Reuse MAL's local Docker/VM `SandboxService`:** This would require exposing the MAL host network and SSH daemon and would mix interactive, user-owned environments with autonomous run cleanup. Keep the domains separate.

## Design Decisions

### Daytona is the initial provider, behind a MAL-owned interface

Use Daytona for v1 because it already supplies snapshots, fast provisioning, lifecycle controls, private Git bootstrap APIs, and standard SSH gateway access. Keep all Daytona SDK types inside `DaytonaEnvironmentProvider`; public API, database, CLI, and domain service types must remain provider-neutral.

This is a provider abstraction for a real boundary, not speculative generalization. It keeps authorization, ownership, API shape, and CLI behavior stable if MAL later adds a self-hosted VM provider.

### Provider credentials stay on the MAL server

Add the Daytona API key only to server configuration. The CLI authenticates to MAL with its existing OAuth bearer token and never receives the Daytona API key. The server creates short-lived SSH access only after re-checking project membership and environment ownership.

Do not persist SSH tokens in Postgres or in the existing MAL auth file. Return them once in the connect response and rely on their short expiry. The CLI may place the token in a temporary SSH configuration only for the lifetime of the `ssh` or `cursor` child process.

### Environments are project-scoped and user-owned

Every environment record belongs to:

- one project;
- the project's workspace, denormalized for efficient authorization and listing;
- the MAL user who created it.

Workspace membership grants visibility to project metadata, but only the creating user may connect, stop, or delete an environment in v1. This avoids silently sharing live shells and repository credentials among workspace members. A later explicit sharing model can relax this.

Handlers must return `404` rather than reveal an environment outside the caller's workspace membership or ownership.

### One environment is one durable provider sandbox

An environment can be stopped and restarted by the provider, but its filesystem persists until deletion. “Ephemeral” means it has an enforced idle stop and automatic deletion policy, not that every SSH disconnect immediately destroys it.

Use these initial server-side defaults, all validated and configurable:

- auto-stop after 60 minutes without provider-observed activity;
- auto-delete 24 hours after the environment enters the stopped state;
- SSH access token lifetime of 60 minutes;
- maximum 3 non-terminal environments per user;
- one configured Daytona snapshot and target/region for all v1 environments.

Do not expose arbitrary snapshot, image, CPU, memory, network, TTL, or environment-variable input in v1. That would turn the create endpoint into an infrastructure escape hatch. Add a controlled profile model later if needed.

### MAL stores desired/observed metadata, not connection secrets

Persist the MAL environment ID, provider ID, project/user ownership, lifecycle state, repository path, timestamps, and sanitized failure details. The provider remains authoritative for whether a sandbox is actually started, stopped, missing, or failed.

Read operations should refresh provider state when the record is non-terminal. Provider webhooks can be considered later; polling on `list`, `status`, and connect is sufficient for v1.

### Creation is synchronous with bounded phases

`POST .../environments` waits for provider creation and repository bootstrap, with explicit timeouts and progress represented by persisted states. This keeps the first CLI workflow simple and is reasonable for Daytona's sandbox model.

Persist the record before calling the provider, then transition through:

```text
provisioning -> bootstrapping -> ready
                    |             |
                    v             v
                  failed       stopped -> deleting -> deleted
```

If provider creation succeeds but bootstrap fails, best-effort delete the provider sandbox and mark the MAL record `failed`. Keep the failed row for diagnosis. If cleanup also fails, retain the provider ID and failure detail so a later delete/reconciliation attempt can finish cleanup.

### Repository bootstrap uses the existing project forge token

After sandbox creation:

1. Obtain the project and verify it still exists.
2. Load the forge token from `ForgeSecretRepository`.
3. Clone `project.repositoryUrl` to `/workspace/repo` through Daytona's Git API, passing the token as the password argument rather than embedding it in the URL or shell command.
4. Do not install a persistent Git credential helper or write the token to a file in the environment.
5. If `.agent-loop/setup.sh` exists, execute it from `/workspace/repo` through the provider process API with a bounded timeout and captured, redacted output.
6. Do not run `.agent-loop/teardown.sh` for interactive environments in v1; that script is part of autonomous task-run lifecycle and can have assumptions that do not apply here.

The environment may clone and fetch private code, but subsequent interactive `git push` will need credentials supplied by the user unless a separate short-lived forge credential design is added. Do not copy the long-lived project forge token into the sandbox merely to make pushes convenient.

### Cursor integration uses standard OpenSSH configuration

`mal env cursor <id>` should not modify `~/.ssh/config`. It should:

1. request fresh connect details from MAL;
2. create a mode-`0600` temporary SSH config directory/file;
3. write a single random alias with the provider host, port, token username, `RemoteCommand none`, `RequestTTY no`, and conservative host-key behavior described below;
4. create a temporary Cursor user-data directory with `User/settings.json` setting `remote.SSH.configFile` to the temporary SSH config;
5. launch a separate Cursor instance with `cursor --new-window --user-data-dir <temp-user-data> --remote ssh-remote+<alias> /workspace/repo`;
6. keep both temporary directories alive until that isolated Cursor process exits, then remove them.

Use the normal Cursor extensions directory so an already installed Remote SSH extension remains available; do not pass a temporary `--extensions-dir`. The separate `--user-data-dir` is required so an existing Cursor process cannot absorb the open request and then lose access to the temporary settings/config. Verify the exact installed Cursor CLI option spelling in the end-to-end smoke test, but keep this isolated-instance design rather than modifying `~/.ssh/config` or the user's normal Cursor settings.

For `mal env ssh`, invoke the system `ssh` binary with direct arguments and an isolated `UserKnownHostsFile` under the MAL config directory.

Do not use `StrictHostKeyChecking=no`. Use `accept-new` with the dedicated MAL known-hosts file so first contact is non-interactive but a changed gateway host key still fails. Document that all Daytona sandboxes share the configured SSH gateway host key, while the short-lived token selects and authenticates the sandbox.

## Command Contract

Add a top-level `env` command in `apps/mal-cli/src/index.ts` with action arguments matching the existing `providers` command style unless Zli supports clean nested subcommands.

### `mal env create`

```text
mal env create --project <project-id-or-short-code> [--name <display-name>] [--json]
```

- `--project` is required in v1. Accept an exact project ID or exact case-insensitive short code visible to the current user. Reject ambiguous short codes and print matching project IDs.
- `--name` is optional display metadata, validated to 1-64 printable characters. It does not become a DNS name.
- On success print ID, name, project, state, repository path, expiry policy, and the exact follow-up commands.
- Do not automatically open SSH or Cursor from `create`; provisioning remains scriptable and the user chooses the client.

### `mal env list`

```text
mal env list [--project <project-id-or-short-code>] [--json]
```

- List only environments owned by the current user.
- Default table columns: ID, name, project short code, state, created time, last refreshed time.
- `--json` prints the API DTO array without presentation-only text.

### `mal env status`

```text
mal env status <environment-id> [--json]
```

- Refresh provider state and print full non-secret metadata.
- Include sanitized `failureMessage` only for failed records.

### `mal env ssh`

```text
mal env ssh <environment-id> [-- command ...]
```

- Without a trailing command, allocate a TTY and open an interactive shell in `/workspace/repo` when supported by the SSH gateway.
- With a trailing command, execute it without a TTY and return the remote exit code.
- Request connect details immediately before spawning SSH.
- Forward `SIGINT`, `SIGTERM`, stdio, and the child exit code correctly.

### `mal env cursor`

```text
mal env cursor <environment-id>
```

- Verify `cursor` exists before requesting an SSH token so a token is not minted unnecessarily.
- Launch `/workspace/repo` through Cursor Remote SSH.
- Print a useful manual `mal env ssh` fallback when Cursor is missing or exits before connecting.

### `mal env stop` and `mal env delete`

```text
mal env stop <environment-id>
mal env delete <environment-id> [--force]
```

- `stop` is idempotent. A stopped environment remains restartable until provider auto-delete or explicit delete.
- The connect endpoint may start a stopped environment and wait until ready before minting SSH access; make this behavior explicit in CLI output.
- `delete` asks for confirmation on an interactive terminal unless `--force` is supplied. In non-interactive mode, require `--force`.
- `delete` is idempotent and marks the MAL record deleted even when the provider reports that the sandbox is already absent.

## API Contract

Create `packages/api/src/environments/` with `environments-model.ts`, `environments-api.ts`, and `index.ts`.

### Public types

Use explicit schemas/types for:

- `EnvironmentId`: branded string.
- `EnvironmentState`: `provisioning | bootstrapping | ready | stopped | failed | deleting | deleted`.
- `EnvironmentDto`: ID, project/workspace IDs, display name, state, repository path, created/updated/provider-refreshed timestamps, optional stopped/deleted timestamps, and optional sanitized failure message. Do not expose `providerEnvironmentId`.
- `CreateEnvironmentRequest`: required branded `projectId` and optional display name.
- `EnvironmentConnectResponse`: `host`, `port`, `username`, `expiresAt`, `workingDirectory`, and `hostKeyAlias` if the provider requires it. The `username` may contain a short-lived provider token and must be treated as a secret by logs/tests.

Compose this user-owned route under `meApi`:

```text
GET    /api/me/environments?projectId=<optional-project-id>
POST   /api/me/environments
GET    /api/me/environments/:environmentId
POST   /api/me/environments/:environmentId/connect
POST   /api/me/environments/:environmentId/stop
DELETE /api/me/environments/:environmentId
```

All endpoints return `401` for missing/invalid authentication and `404` for an inaccessible project or an environment not owned by the caller. Create returns `400` for policy limits, missing forge credentials, or invalid input. Provider outages and unexpected bootstrap failures use the standard `500` response helper, while the failed environment record remains inspectable.

Do not duplicate lifecycle endpoints under the project route tree. The environment DTO carries `workspaceId` and `projectId`, and create authorization resolves the requested project through `WorkspaceMembershipsService`. The current-user route is canonical because every post-create operation is owner-centric and the CLI should need only an environment ID.

## Persistence Model

Add a Drizzle table `development_environments` in `apps/server/src/db/schema.ts` with:

- `id`: text primary key, branded as `EnvironmentId` at the service edge;
- `workspaceId`: required FK to workspaces with cascade delete;
- `projectId`: required FK to projects with cascade delete;
- `ownerUserId`: required FK to Better Auth's user table with cascade delete;
- `provider`: enum with initial value `daytona`;
- `providerEnvironmentId`: required text after provisioning; nullable only while the initial create call is pending;
- `displayName`: required text;
- `state`: lifecycle enum, default `provisioning`;
- `repositoryPath`: required text, default `/workspace/repo`;
- `failureCode`: nullable stable internal code;
- `failureMessage`: nullable sanitized text, never raw SDK objects or command output containing credentials;
- `providerRefreshedAt`, `stoppedAt`, `deletedAt`: nullable timestamps;
- standard `createdAt` and `updatedAt` timestamps.

Add indexes for `(ownerUserId, createdAt)`, `(projectId, createdAt)`, and a unique `(provider, providerEnvironmentId)` constraint that permits the initial null. Do not use a database enum for provider error codes; use an exported TypeScript union so codes can evolve without migrations.

Follow the repository's established migration workflow. Do not hand-author generated Drizzle artifacts if the project supplies a generation command at implementation time.

## Server Domain Design

Create `apps/server/src/environments/`.

### `EnvironmentRepository.ts`

Expose methods with explicit domain types:

- `createPending(input)`;
- `setProviderEnvironment(id, providerEnvironmentId)`;
- `updateState(id, transition)`;
- `findOwnedById(ownerUserId, environmentId)`;
- `listOwned(ownerUserId, projectId?)`;
- `findNonTerminalByProvider(provider, providerEnvironmentId)`;
- `countActiveForOwner(ownerUserId)`.

Centralize legal state transitions in the service or repository and test them. Avoid arbitrary partial update objects that permit `deleted -> ready` or silently clear failure metadata.

### `EphemeralEnvironmentProvider.ts`

Define provider-neutral values and a discriminated `Result`-style return for known failures. The interface should cover:

```typescript
interface EphemeralEnvironmentProvider {
  create(input: ProviderCreateEnvironmentInput): Promise<ProviderResult<ProviderEnvironment>>;
  get(providerEnvironmentId: string): Promise<ProviderResult<ProviderEnvironmentStatus>>;
  start(providerEnvironmentId: string): Promise<ProviderResult<ProviderEnvironmentStatus>>;
  stop(providerEnvironmentId: string): Promise<ProviderResult<ProviderEnvironmentStatus>>;
  delete(providerEnvironmentId: string): Promise<ProviderResult<void>>;
  cloneRepository(input: ProviderCloneRepositoryInput): Promise<ProviderResult<void>>;
  pathExists(providerEnvironmentId: string, path: string): Promise<ProviderResult<boolean>>;
  execute(input: ProviderExecuteInput): Promise<ProviderResult<ProviderCommandResult>>;
  createSshAccess(providerEnvironmentId: string, expiresInMinutes: number): Promise<ProviderResult<ProviderSshAccess>>;
}
```

Known error kinds should include `not-found`, `unavailable`, `timeout`, `quota-exceeded`, `invalid-snapshot`, `command-failed`, and `unexpected-provider-response`. Keep raw provider exceptions as logged causes, not API payloads.

### `DaytonaEnvironmentProvider.ts`

- Construct one `Daytona` SDK client from validated server env.
- Create with the configured snapshot, target, labels, name, `ephemeral: true`, and configured auto-stop. Also set an explicit auto-delete policy if the SDK's current `ephemeral` semantics do not cover the desired stopped retention window; verify the installed SDK version rather than assuming old documentation signatures.
- Labels should include MAL environment ID, workspace ID, project ID, and owner user ID using stable keys. Labels aid operational reconciliation but are not authorization.
- Normalize Daytona states into MAL provider states.
- Redact API keys, forge tokens, and SSH tokens from all logs and errors.
- Convert `createSshAccess` output into `ProviderSshAccess`. Keep SSH gateway host/port in validated env because managed and self-hosted Daytona deployments differ.
- Write adapter tests against a mocked SDK client. Use dynamic-import Vitest mocks per `docs/02-coding-practices.md`.

### `EnvironmentService.ts`

`EnvironmentService` coordinates repository, project, forge secret, membership-adjacent data, provider, logger, and policy. It must not know Daytona SDK types.

Creation sequence:

1. Check active environment quota for the owner.
2. Load project and forge secret before provisioning. Return a typed `missing-forge-credential` failure before creating provider resources.
3. Create the pending MAL row and derive a provider-safe name such as `mal-<environment-id-prefix>`.
4. Call provider create and immediately persist the provider ID.
5. Move to `bootstrapping`.
6. Clone to `/workspace/repo` with the decrypted token passed directly to the provider call.
7. Check for `.agent-loop/setup.sh`; if present, execute `bash .agent-loop/setup.sh` with `cwd=/workspace/repo`, a configured timeout, and no forge token in the environment.
8. Mark `ready` and return the DTO.
9. On failure, best-effort delete and mark `failed` with a stable code and sanitized message.

Connect sequence:

1. Load the owned environment.
2. Reject terminal/failed/deleting states.
3. Refresh provider state.
4. If stopped, start and wait with a bounded timeout, then update MAL state to `ready`.
5. Mint short-lived SSH access and return it without persistence or logging.

Stop/delete must be idempotent. Provider `not-found` during refresh/delete maps to MAL `deleted`. A database transaction cannot span external provider calls; persist each lifecycle boundary and make retry behavior explicit.

### Authorization handlers

Handlers should:

- resolve either browser session or MAL OAuth bearer identity using the existing route authentication pattern;
- verify workspace/project membership before exposing project data;
- pass a non-null owner user ID to the service;
- enforce ownership on existing environment operations;
- return standard helper responses.

Keep nullability at these handler edges. Repository/provider/service methods should require fully resolved IDs and values.

### Reconciliation

For v1, refresh on list, status, connect, stop, and delete. Limit list refresh concurrency to avoid a provider request burst. If provider refresh fails, return the last known DTO with a clear `providerStatus: unavailable` field only if that field is added to the API contract; otherwise fail the request consistently rather than pretending the cached state is current.

Add a small reconciliation method that can later be called by a background job. Do not add a new queue/worker in v1 unless tests show provider-created orphan cleanup cannot be made reliable through create/delete retries.

## Configuration and Dependency Wiring

Add validated settings in `apps/server/src/env.ts`:

```text
DAYTONA_API_KEY                 required when environment feature is enabled
DAYTONA_API_URL                 default https://app.daytona.io/api
DAYTONA_TARGET                  optional managed target/region
DAYTONA_SNAPSHOT                required configured snapshot name
DAYTONA_SSH_GATEWAY_HOST        default ssh.app.daytona.io for managed Daytona
DAYTONA_SSH_GATEWAY_PORT        default 22
ENVIRONMENTS_ENABLED            default false
ENVIRONMENT_AUTO_STOP_MINUTES   default 60
ENVIRONMENT_AUTO_DELETE_MINUTES default 1440
ENVIRONMENT_SSH_TOKEN_MINUTES   default 60
ENVIRONMENT_SETUP_TIMEOUT_MS    default 900000
ENVIRONMENT_MAX_PER_USER        default 3
```

Use Zod constraints for positive integer ranges. When `ENVIRONMENTS_ENABLED=false`, construct a disabled provider/service result that returns a stable feature-disabled error rather than failing unrelated server startup because Daytona variables are absent.

Wire repository, provider, and service through `apps/server/src/services.ts` and expose only the service/repository interfaces needed by handlers and tests.

Use `pnpm --filter @mono/server add @daytona/sdk` to add the dependency. Do not edit `package.json` manually.

## CLI Implementation Guide

### API client

The current `apps/mal-cli/src/api.ts` duplicates fetch setup per endpoint. Extract a small authenticated request helper only if doing so makes the environment calls clearer; keep the change scoped and preserve current provider login behavior.

Parse all new responses with schemas imported from `@mono/api`. Add `@mono/api` as a workspace dependency to `@mono/mal-cli` with pnpm if it is not already available. Avoid redefining API DTO schemas in the CLI.

Ensure error messages distinguish:

- not logged in;
- project/environment not found or inaccessible;
- feature disabled;
- environment quota exceeded;
- provisioning/bootstrap failure;
- provider unavailable;
- local executable (`ssh` or `cursor`) missing.

Never include the connect response username/token in debug output or thrown error messages.

### Process execution

Create a small injectable command runner around `node:child_process.spawn` for tests. Use `shell: false`, pass arguments as an array, inherit stdio for interactive commands, and propagate signals/exit status.

Resolve executables through the normal `PATH`; do not download SSH or Cursor binaries.

### Temporary SSH material

Create a CLI helper under `apps/mal-cli/src/ssh/` that:

- creates temp directories with mode `0700`;
- writes configs and known-host files with mode `0600`;
- uses a random alias, not the environment display name;
- quotes/escapes OpenSSH config values safely or rejects unsupported whitespace/control characters from the server response;
- cleans up in `finally` and on handled process signals;
- never stores the provider token in `${XDG_CONFIG_HOME}/mal/auth.json`.

For Cursor, verify the installed `cursor` CLI's Remote SSH syntax during implementation. The target outcome is equivalent to opening `vscode-remote://ssh-remote+<alias>/workspace/repo`; use the least brittle supported invocation and cover command construction in tests.

## Testing Strategy

### API package

- Schema parsing for every environment state and connect response.
- Reject secrets or provider IDs accidentally added to public DTO fixtures through exact-object tests where practical.

### Server unit tests

- Legal and illegal lifecycle transitions.
- Create success with clone and optional setup script.
- Missing forge token does not call provider create.
- Quota exceeded does not call provider create.
- Clone/setup failure attempts provider deletion and leaves a failed diagnostic row.
- Cleanup failure preserves provider ID for retry.
- Connect starts a stopped environment before minting SSH access.
- Connect never persists or logs the SSH token.
- Stop/delete idempotency and provider-not-found reconciliation.
- Cross-user and cross-workspace access returns `404`.
- Provider timeout/unavailability maps to the expected standard response.

Prefer in-memory fakes for repository/provider/service behavior following `docs/04-test-fakes.md`; mock only the Daytona SDK boundary and process spawning boundary.

### CLI tests

The CLI currently has no tests. Add a Vitest setup consistent with other apps and refactor `main` so parsing/action selection can be imported without automatically executing the process.

Cover:

- command/option parsing and help;
- project ID/short-code resolution, including ambiguity;
- table versus JSON output;
- noninteractive delete requiring `--force`;
- exact `ssh` argv and exit-code propagation;
- exact Cursor argv/environment selected after checking the installed CLI behavior;
- temp file modes and cleanup after success, spawn failure, and signal;
- API error redaction so SSH tokens never appear in captured output.

### Manual end-to-end smoke test

Against a non-production Daytona organization and disposable project:

1. Enable the feature and configure a snapshot containing Git, Bash, OpenSSH-compatible user tooling, and requirements for Cursor's remote server.
2. Build the MAL SEA binary.
3. `mal login` and `mal env create --project <short-code>`.
4. Confirm the private repository exists at `/workspace/repo` and setup ran.
5. Connect with `mal env ssh` and run a noninteractive command.
6. Open with `mal env cursor` and confirm file editing, terminal access, and language tooling.
7. Stop, reconnect to exercise automatic start, then delete.
8. Confirm the provider sandbox is gone and the MAL record is terminal.
9. Exercise SSH token expiry/revocation and verify a stale token cannot reconnect.
10. Force a bootstrap failure and confirm no untracked Daytona sandbox remains.

Finally run `pnpm typecheck` and `pnpm check` and resolve all issues.

## Documentation

Add `docs/decisions/daytona-ephemeral-environments.md` because this introduces a new external provider and lifecycle pattern. Document:

- why Daytona was selected over raw VMs and existing task sandboxes;
- provider abstraction boundary;
- ownership and authorization model;
- lifecycle and cleanup guarantees;
- repository credential limitations;
- SSH token and temporary config handling;
- managed versus self-hosted Daytona configuration;
- operational cost/quota considerations and how to disable the feature.

Update `apps/mal-cli/AGENTS.md` so the command list and manual smoke test include environment commands. Update the repository README only if it is the current operator setup entry point. `docs/00-index.md` already lists the Decisions folder and must not list the individual decision record.

## Edge Cases and Failure Handling

- **Duplicate create after client timeout:** The first request may still finish. Return the created environment ID only after persistence and use the MAL row ID as a Daytona label. A future idempotency key can be added if real usage shows retries create duplicates; do not silently deduplicate by display name.
- **Provider created, DB update failed:** Log the MAL environment ID and provider ID in structured server logs without secrets. Label-based operator reconciliation can locate the orphan. Keep create phases small and retry the DB write before returning failure.
- **Provider auto-deleted a stopped sandbox:** Refresh maps it to MAL `deleted`; connect returns a clear terminal-state error.
- **Setup script hangs:** Enforce the configured timeout, capture bounded output, delete the sandbox, and mark failed.
- **Setup script emits credentials:** Do not store full stdout/stderr in the database. Log bounded output through a redaction function and expose only a generic failure message to the CLI.
- **SSH gateway unavailable:** Do not mutate the environment state to failed; return provider unavailable and allow retry.
- **Expired token while Cursor is still connected:** Existing SSH sessions may remain, but reconnection requires `mal env cursor` again to mint a new token. Document this behavior.
- **Cursor launches and detaches immediately:** Temp config lifetime must be validated in the smoke test. If Cursor needs the config for reconnects after the launcher exits, keep only a tokenless permanent alias plus a `ProxyCommand` back through `mal`, or add `mal env ssh-config` in a follow-up. Do not persist a short-lived token as the workaround.
- **Changed SSH gateway host key:** Fail closed against the dedicated known-hosts file and print the file path/operator remediation. Do not automatically discard a changed key.
- **Project deleted:** Cascade the MAL record, but deletion of external provider resources cannot be guaranteed by an FK cascade. Before enabling cascade deletion in handlers, explicitly delete active environments, or change project deletion to refuse while active environments exist. The implementation must choose and test one behavior; recommended v1 behavior is refuse project deletion with active environments and require cleanup first.
- **Server shutdown during provisioning:** The persisted non-terminal row and provider labels allow later reconciliation. Status/delete retries must work from any persisted phase with a provider ID.

## Security Requirements

- Daytona API key exists only in server env/secret management.
- Forge token is passed only to the provider Git clone API and is not written into clone URLs, shell history, Git config, or environment variables.
- SSH token is minted only after fresh authorization, returned once, not persisted, and never logged.
- CLI temp directories/configs are mode `0700`/`0600` and cleaned up.
- Use a dedicated known-hosts file with `StrictHostKeyChecking=accept-new`, not disabled host-key checking.
- Environment list/status DTOs contain no provider IDs, API keys, forge tokens, SSH tokens, or raw provider errors.
- Creation inputs cannot select arbitrary images, commands, mounts, networks, or secrets.
- Per-user quota, provider quota errors, setup timeouts, and delete retries prevent unbounded resource leakage.

## Out of Scope

- A frontend UI for environment lifecycle or browser terminals.
- Sharing an environment with other workspace members.
- Arbitrary images, snapshots, resource sizes, regions, environment variables, secrets, ports, or preview URLs selected by CLI users.
- Automatically installing or configuring Cursor locally.
- Persisting project forge credentials inside the environment for interactive pushes.
- Running autonomous MAL tasks inside these interactive environments.
- Replacing the existing Docker/VM task sandbox architecture.
- Provider webhooks, scheduled background reconciliation, billing UI, or usage metering beyond a simple per-user quota.
- Multi-provider selection in the CLI. The server-side interface exists so a later provider can be added without an API redesign.

## Acceptance Criteria

- An authenticated user can create an environment for a project they can access and cannot create one for an inaccessible project.
- The environment contains the configured repository at `/workspace/repo` and runs `.agent-loop/setup.sh` when present.
- `mal env ssh` opens a standard SSH session without requiring Daytona credentials or CLI installation on the user's machine.
- `mal env cursor` opens `/workspace/repo` as a Cursor Remote SSH workspace without modifying the user's permanent SSH config or persisting an SSH token.
- Only the creator can list, inspect, connect, stop, or delete the environment.
- Stopped environments can be reconnected until deletion; missing provider sandboxes reconcile to deleted.
- Partial provisioning and bootstrap failures are diagnosable and make a best-effort provider cleanup.
- Provider API keys, forge tokens, and SSH tokens are absent from database rows, API logs, CLI auth storage, and user-visible errors.
- Focused tests, `pnpm typecheck`, and `pnpm check` pass, and the SEA binary completes the manual Daytona smoke test.
