---
name: Agent harness support
overview: Introduce a pluggable agent harness abstraction so that OpenCode, Claude Code, Cursor CLI, and Codex CLI can all be used to execute tasks, with harness selection configurable at workspace, project, and task levels via a dedicated configuration table. Configuration is surfaced as part of each entity's regular DTO and updated through their existing endpoints.
todos:
  - id: core-abstraction
    content: Define AgentHarness interface (returning file contents + container paths, not writing to disk), HarnessRegistry, AgentHarnessId type (in @mono/api), and HarnessPreparationContext (with credentials) in new apps/server/src/harness/ domain folder
    status: completed
  - id: extract-opencode
    content: Extract existing OpenCode logic from OpenCodeConfigService into an OpenCodeHarness implementation of the new interface
    status: completed
  - id: parameterize-lifecycle
    content: Update lifecycle.sh to run setupCommands then AGENT_RUN_COMMAND env var instead of hardcoded opencode command
    status: completed
  - id: sandbox-env-support
    content: Add env support to SanboxInitOptions and DockerSandboxService.createNewSandbox() (pass through to Docker Env config)
    status: completed
  - id: refactor-workflow-execution
    content: Refactor WorkflowExecutionService.prepare() to use AgentHarness.prepare() for file generation, then materialise files to disk and create volume mounts. Task file stays in WorkflowExecutionService.
    status: completed
  - id: commit-phase-1
    content: "Commit: Phase 1 - Core harness abstraction and OpenCode refactor"
    status: completed
  - id: db-schema-config-table
    content: Add agent_harness_configuration table with nullable unique FKs for workspaceId, projectId, taskId and an agentHarnessId column
    status: completed
  - id: cascade-resolution
    content: Implement resolveHarnessId cascade query logic (with bulk resolution support for list endpoints) using the configuration table
    status: completed
  - id: config-in-dtos
    content: Extend workspace, project, and task DTOs with agentHarnessId (nullable override) and resolvedAgentHarnessId (effective value after cascade). Wire reads/writes through existing GET/PATCH endpoints. Reject writes selecting a harness whose API key is not configured.
    status: completed
  - id: workspace-patch-api
    content: Add PATCH endpoint and updateWorkspaceRequestSchema to the workspaces API (currently only has GET and POST)
    status: completed
  - id: harnesses-api
    content: Add GET /workspaces/:workspaceId/harnesses endpoint returning available harnesses with auth status
    status: completed
  - id: commit-phase-2
    content: "Commit: Phase 2 - Database, API, and cascade resolution"
    status: completed
  - id: harness-auth-service
    content: Create HarnessAuthService (or extend ModelProviderService) with ANTHROPIC_API_KEY, CURSOR_API_KEY, OPENAI_API_KEY env vars
    status: completed
  - id: claude-code-harness
    content: Implement ClaudeCodeHarness (config generation, MCP setup via setupCommands, run command)
    status: completed
  - id: cursor-cli-harness
    content: Implement CursorCliHarness (config generation, .cursor/mcp.json, run command)
    status: completed
  - id: codex-cli-harness
    content: Implement CodexCliHarness (config generation, ~/.codex/config.toml, run command)
    status: completed
  - id: update-dockerfile
    content: Update Dockerfile to install all four harnesses
    status: completed
  - id: commit-phase-3
    content: "Commit: Phase 3 - Auth service, additional harnesses, and Dockerfile"
    status: completed
  - id: frontend-workspace-dialog
    content: Add WorkspaceConfigDialog for editing workspace name and default harness selection, triggered from sidebar header
    status: completed
  - id: frontend-project-harness
    content: Add harness selector to ProjectDialog with 'Inherit from workspace' option
    status: completed
  - id: frontend-task-harness
    content: Add optional harness override to TaskDialog with 'Inherit from project' option
    status: completed
  - id: commit-phase-4
    content: "Commit: Phase 4 - Frontend harness selection UI"
    status: pending
isProject: false
---

# Multi-Agent Harness Support

## Current State

The codebase is tightly coupled to OpenCode:

- `[Dockerfile](Dockerfile)` installs only OpenCode
- `[lifecycle.sh](apps/server/src/sandbox/lifecycle.sh)` hardcodes `opencode run ...`
- `[OpenCodeConfigService](apps/server/src/workflow/OpenCodeConfigService.ts)` generates OpenCode-specific config/auth files and writes them to disk
- `[WorkflowExecutionService](apps/server/src/workflow/WorkflowExecutionService.ts)` mounts OpenCode-specific volume paths

## Target Harnesses

- **OpenCode**: `curl -fsSL https://opencode.ai/install | bash` / `opencode run "prompt"` / `OPENROUTER_API_KEY` (optional, has free models) / `opencode.json` config file
- **Claude Code**: `curl -fsSL https://claude.ai/install | bash` / `claude -p "prompt" --allowedTools "*"` / `ANTHROPIC_API_KEY` (required) / MCP via `claude mcp add --transport http` CLI command
- **Cursor CLI**: `curl https://cursor.com/install -fsS | bash` / `agent -p --force "prompt"` / `CURSOR_API_KEY` (required) / `.cursor/mcp.json`
- **Codex CLI**: `npm install -g @openai/codex` / `codex exec "prompt"` / `OPENAI_API_KEY` (required) / `~/.codex/config.toml`

All four support MCP, which means the existing MCP tools (tasks, projects, forge) will work with all harnesses.

## Resolved Design Decisions

These decisions were made during planning and should be treated as requirements by the implementing agent.

### 1. Credentials flow via HarnessPreparationContext

Each harness receives its API key (as a `ProtectedString`) through the `HarnessPreparationContext`, passed per-call to `prepare()`. The `WorkflowExecutionService` looks up the correct credential from `HarnessAuthService` and includes it in the context. Harnesses do not access auth services directly.

### 2. Task file stays in WorkflowExecutionService

`WorkflowExecutionService` continues to write `task.txt` and mount it at `/task.txt`. All harnesses can assume `/task.txt` exists. Harnesses can additionally reference it in their `runCommand` (e.g., `claude -p "$(cat /task.txt)"`).

### 3. Unavailable harnesses are rejected at the API level

When a user attempts to set a harness (on a workspace, project, or task) whose API key is not configured, the API returns a 400 error with a clear message. This prevents runtime failures. As a safety net, `WorkflowExecutionService` also checks availability before starting a run and fails the run immediately if the harness is unavailable.

### 4. Pre-run setup via setupCommands

`AgentHarnessPreparation` includes a `setupCommands: string[]` field for commands that must run inside the container before the main agent command (e.g., `claude mcp add --transport http ...`). The lifecycle script runs these in order before `AGENT_RUN_COMMAND`. These are distinct from the project's `.agent-loop/setup.sh` which runs even earlier.

### 5. AgentHarnessId lives in @mono/api

Since `AgentHarnessId` appears in workspace, project, and task DTOs shared between frontend and server, its type and Zod schema are defined in `packages/api` (e.g., `packages/api/src/harnesses/harnesses-model.ts`).

### 6. SandboxService needs env var support

`[SanboxInitOptions](apps/server/src/sandbox/SandboxService.ts)` currently has no `env` field. An `env?: Record<string, string>` must be added and wired through to `docker.createContainer({ Env: [...] })` in `DockerSandboxService`. This is needed for `AGENT_RUN_COMMAND` and `AGENT_SETUP_COMMANDS` injection.

### 7. Bulk cascade resolution for list endpoints

The `AgentHarnessConfigRepository` must support resolving harness IDs in bulk (e.g., for all tasks in a project at once) to avoid N+1 queries on list endpoints. This can be done with a single LEFT JOIN against the config table when fetching entities.

## Architecture

### AgentHarness Abstraction

Create an `AgentHarness` interface in a new `apps/server/src/harness/` domain folder. The key design principle is that **harnesses do not write files or know about the host filesystem**. They return file contents and intended container paths. The orchestration layer (`WorkflowExecutionService`) is responsible for materialising those files to disk and creating the appropriate mounts -- this keeps the harness abstraction portable to VMs or other runtimes later.

```typescript
// In packages/api/src/harnesses/harnesses-model.ts
const agentHarnessIdSchema = z.enum(["opencode", "claude-code", "cursor-cli", "codex-cli"]);
type AgentHarnessId = z.infer<typeof agentHarnessIdSchema>;

// In apps/server/src/harness/AgentHarness.ts
interface HarnessPreparationContext {
  projectId: ProjectId;
  taskId: TaskId;
  mcpServerUrl: string;
  credentials: ProtectedString | undefined;
}

interface HarnessFile {
  containerPath: string;
  contents: string;
  mode?: "ro" | "rw";
}

interface AgentHarnessPreparation {
  files: HarnessFile[];
  setupCommands: string[];
  runCommand: string;
  env?: Record<string, string>;
}

interface AgentHarness {
  id: AgentHarnessId;
  displayName: string;
  prepare(context: HarnessPreparationContext): AgentHarnessPreparation;
}
```

A `HarnessRegistry` holds all registered harness implementations and provides lookup by `AgentHarnessId`.

### File Materialisation in WorkflowExecutionService

`[WorkflowExecutionService.prepare()](apps/server/src/workflow/WorkflowExecutionService.ts)` currently writes OpenCode config files directly to the temp directory. This changes to:

1. Resolve the effective harness via `AgentHarnessConfigRepository.resolveHarnessId(taskId, projectId, workspaceId)`
2. Look up the `AgentHarness` from the `HarnessRegistry`
3. Look up the credential from `HarnessAuthService`
4. Call `harness.prepare(context)` to get `AgentHarnessPreparation`
5. For each `HarnessFile`, write `file.contents` to a path under the run's temp directory
6. Map each written file to a Docker volume bind mount (`{ hostPath, containerPath, mode }`)
7. Pass `runCommand`, `setupCommands`, and `env` to the sandbox via `SanboxInitOptions`

Task file (`task.txt`) writing and the `/code` repository mount remain in `WorkflowExecutionService` -- they are not the harness's responsibility.

### Lifecycle Script Parameterisation

Instead of hardcoding `opencode run ...` in `[lifecycle.sh](apps/server/src/sandbox/lifecycle.sh)`, the agent command and setup commands are injected via environment variables. The setup/teardown wrapper logic remains shared:

```bash
# ... existing project setup.sh logic ...

# Run harness-specific setup commands (e.g., claude mcp add ...)
if [ -f /harness-setup.sh ]; then
  source /harness-setup.sh
fi

# Run the agent
eval "$AGENT_RUN_COMMAND"
AGENT_EXIT_CODE=$?

# ... existing teardown logic ...
exit $AGENT_EXIT_CODE
```

The `setupCommands` from the harness are written to `/harness-setup.sh` as a `HarnessFile` (or injected as an env var). Using a file avoids shell escaping issues with complex commands in env vars.

### Cascading Configuration via `agent_harness_configuration` Table

A single dedicated `agent_harness_configuration` table stores overrides at each level of the hierarchy. Each row targets exactly one level, identified by which FK is non-null:

```
agent_harness_configuration
  id:            uuid PK (uuidv7)
  workspace_id:  uuid? FK -> workspaces.id  (UNIQUE where NOT NULL)
  project_id:    uuid? FK -> projects.id    (UNIQUE where NOT NULL)
  task_id:       uuid? FK -> tasks.id       (UNIQUE where NOT NULL)
  agent_harness_id: text NOT NULL
```

**Constraints:**

- Partial unique indexes on each FK column (ensures at most one config per workspace/project/task)
- A CHECK constraint ensuring exactly one of the three FKs is non-null: `CHECK (num_nonnulls(workspace_id, project_id, task_id) = 1)`

**Cascade resolution** walks: task -> project -> workspace. A `resolveHarnessId(taskId, projectId, workspaceId)` function queries the table for the most specific match via a single `COALESCE` query:

```sql
SELECT COALESCE(
  (SELECT agent_harness_id FROM agent_harness_configuration WHERE task_id = $1),
  (SELECT agent_harness_id FROM agent_harness_configuration WHERE project_id = $2),
  (SELECT agent_harness_id FROM agent_harness_configuration WHERE workspace_id = $3)
) AS resolved_harness_id
```

If nothing is configured at any level, the system falls back to `"opencode"` as a hardcoded default (since it requires no API key).

**Bulk resolution** for list endpoints (e.g., all tasks for a project) uses a LEFT JOIN against the config table rather than per-entity queries.

**Scalability:** When we need more overridable config (e.g., model selection, custom base image), we add columns to this table (or a JSONB `configuration` column) rather than touching `projects`, `tasks`, or `workspaces`. The same cascade resolution pattern applies.

### Configuration as Part of Entity DTOs

The harness configuration is **not** exposed via separate CRUD endpoints. Instead, it is surfaced as part of the regular DTOs for workspaces, projects, and tasks, and written through their existing update endpoints.

**Workspace DTO** (currently `[workspaceDtoSchema](packages/api/src/workspaces/workspaces-api.ts)` -- only has `id`, `name`, `createdAt`):

- Add `agentHarnessId: AgentHarnessId | null` -- the workspace-level default (null means use the system default, `"opencode"`)

**Workspace API** (currently has only `GET` and `POST`):

- Add a `PATCH /:workspaceId` endpoint with `updateWorkspaceRequestSchema` accepting optional `name` and optional `agentHarnessId`
- The handler upserts/deletes the corresponding row in `agent_harness_configuration` when `agentHarnessId` is provided
- **Reject** setting a harness whose API key is not configured (400 response)

**Project DTO** (`[projectDtoSchema](packages/api/src/projects/projects-api.ts)`):

- Add `agentHarnessId: AgentHarnessId | null` -- the project-level override (null = inherit)
- Add `resolvedAgentHarnessId: AgentHarnessId` -- the effective value after cascade resolution (for display)
- Update `createProjectRequestSchema` and `updateProjectRequestSchema` with optional `agentHarnessId`
- **Reject** setting a harness whose API key is not configured (400 response)

**Task DTO** (`[taskDtoSchema](packages/api/src/tasks/tasks-api.ts)`):

- Add `agentHarnessId: AgentHarnessId | null` -- the task-level override (null = inherit)
- Add `resolvedAgentHarnessId: AgentHarnessId` -- the effective value after cascade
- Update `createTaskRequestSchema` and `updateTaskRequestSchema` with optional `agentHarnessId`
- **Reject** setting a harness whose API key is not configured (400 response)

When the backend serialises a workspace/project/task, it joins against `agent_harness_configuration` to populate the override field, and runs the cascade to populate the resolved field.

### Harnesses Endpoint (Workspace-Scoped)

A new `GET /workspaces/:workspaceId/harnesses` endpoint returns the list of registered harnesses and their auth availability. Scoping to the workspace allows future per-workspace API key storage. Response shape:

```typescript
{
  harnesses: Array<{
    id: AgentHarnessId;
    displayName: string;
    isAvailable: boolean; // true if the required API key is configured
  }>;
}
```

This endpoint is used by the frontend to populate harness selector dropdowns and show availability indicators.

### Authentication / Secrets

Each harness has its own API key. Following the existing pattern of `[ModelProviderService](apps/server/src/providers/ModelProviderServices.ts)` and env vars:

- Add new optional env vars to `[env.ts](apps/server/src/env.ts)`: `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`, `OPENAI_API_KEY`
- Create a `HarnessAuthService` (or extend `ModelProviderService`) that maps `AgentHarnessId` to its corresponding key, wrapped in `ProtectedString`
- Exposes `isAvailable(harnessId): boolean` and `getCredential(harnessId): ProtectedString | undefined`
- At startup, warn if a harness is configured as a workspace default but its API key is missing (unless it's OpenCode, which has free models)

### Docker Image

Update the `[Dockerfile](Dockerfile)` to install all four harnesses in a single fat image:

```dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y git curl sudo iputils-ping nodejs npm

# OpenCode
RUN curl -fsSL https://opencode.ai/install | bash

# Claude Code
RUN curl -fsSL https://claude.ai/install | bash

# Cursor CLI
RUN curl https://cursor.com/install -fsS | bash

# Codex CLI
RUN npm install -g @openai/codex

ENV PATH="/root/.local/bin:/root/.opencode/bin:${PATH}"
WORKDIR /code
```

Note: the `PATH` may need additional entries depending on where each harness installs. Verify install locations during implementation.

### Frontend Changes

- **Workspace configuration dialog**: New `WorkspaceConfigDialog` component, triggered from the sidebar header area (e.g., a gear icon or click on the workspace name). Allows editing:
  - Workspace name
  - Default agent harness (dropdown populated from `GET /workspaces/:id/harnesses`, showing availability)
  - Uses the new `PATCH /workspaces/:id` endpoint
- **Project dialog**: Add harness selector dropdown to `[ProjectDialog.tsx](apps/frontend/app/components/projects/ProjectDialog.tsx)`, with "Inherit from workspace (X)" as the default/null option, plus all available harnesses. Unavailable harnesses are shown disabled.
- **Task dialog**: Add optional harness override to `[TaskDialog.tsx](apps/frontend/app/components/tasks/TaskDialog.tsx)`, with "Inherit from project (X)" as the default/null option. Unavailable harnesses are shown disabled.

### Service Wiring

In `[services.ts](apps/server/src/services.ts)`:

- Instantiate each harness implementation and register in a `HarnessRegistry`
- Instantiate `HarnessAuthService`
- Pass `HarnessRegistry` and `HarnessAuthService` to `WorkflowExecutionService` (replacing direct `OpenCodeConfigService` dependency)
- Add a new `AgentHarnessConfigRepository` for reading/writing the `agent_harness_configuration` table and resolving the cascade

## Additional Considerations

- **Startup validation**: Warn if a workspace's configured default harness has no API key set (unless it's OpenCode with free models)
- **Harness-specific MCP configuration**: Each harness configures MCP differently. OpenCode uses a config file, Claude Code uses `setupCommands` (CLI), Cursor uses `.cursor/mcp.json` file, Codex uses `~/.codex/config.toml`. Each harness returns the appropriate files and/or setup commands.
- **Permission models**: Claude Code needs `--allowedTools "*"`, Cursor needs `--force`, Codex needs appropriate sandbox flags, OpenCode has `"*": "allow"`. Each harness handles its own permissions in `prepare()`.
- **Model selection**: Currently partly handled in `OpenCodeConfigService.selectModel()`. This should move into each harness implementation. Model preference could later be added to the `agent_harness_configuration` table as another overridable field.
- **Future: per-workspace API keys**: The harnesses endpoint is workspace-scoped to allow future per-workspace secret storage, but for now keys come from server env vars.

## Phases

This is a large feature. The agent should **commit after completing each phase**.

1. **Phase 1 -- Core abstraction + OpenCode refactor**: Define the interface (in `@mono/api` and `apps/server/src/harness/`), extract OpenCode into a harness implementation, add env var support to `SandboxService`, refactor `WorkflowExecutionService` to use the new file-contents-based approach, parameterise `lifecycle.sh` with `setupCommands` and `AGENT_RUN_COMMAND`. Everything should still work identically after this phase. **Commit.**
2. **Phase 2 -- Database + API + cascade**: Add `agent_harness_configuration` table schema, `AgentHarnessConfigRepository` with cascade resolution (including bulk), `PATCH` workspace endpoint, `GET /workspaces/:id/harnesses` endpoint, extend workspace/project/task DTOs with harness fields, add API-level validation rejecting unavailable harnesses. **Commit.**
3. **Phase 3 -- Auth service + additional harnesses**: Create `HarnessAuthService`, implement Claude Code, Cursor CLI, Codex CLI harnesses. Update Dockerfile. **Commit.**
4. **Phase 4 -- Frontend**: `WorkspaceConfigDialog` (triggered from sidebar header), project/task harness selectors with availability indicators. **Commit.**

