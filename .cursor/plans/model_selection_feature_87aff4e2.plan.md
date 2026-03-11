---
name: Model Selection Feature
overview: Add per-harness model selection with the same scoped inheritance pattern (task -> project -> workspace -> harness default) as the existing harness selection, stored in the same DB table and surfaced through the same UI pattern.
todos:
  - id: api-schemas
    content: "Restructure DTOs in `packages/api/` ONLY: define `agentConfigSchema` and `harnessModelSchema` in the harnesses module, replace flat `agentHarnessId` with nested `agentConfig: { harnessId, modelId } | null` on workspace/project/task DTOs and request schemas, add `models` array to `harnessListItemSchema`. Do NOT update server or frontend consumers -- later todos handle those. Typecheck WILL fail after this todo."
    status: completed
  - id: db-schema
    content: Update `apps/server/src/db/schema.ts` to add nullable `agentModelId` text column to `agentHarnessConfigurationTable`. The user will handle the DB migration separately.
    status: completed
  - id: harness-config-repo
    content: "Refactor `AgentHarnessConfigRepository` in `apps/server/src/harness/AgentHarnessConfigRepository.ts`: define `ScopedHarnessConfig` type, update all getters to return `ScopedHarnessConfig | null`, update setters to accept `ScopedHarnessConfig | null`, rename `resolveHarnessId` to `resolveHarnessConfig` returning `ScopedHarnessConfig`. Typecheck WILL fail after this todo because callers haven't been updated yet."
    status: completed
  - id: harness-interface-impls
    content: "Update `AgentHarness` interface to include `models: readonly HarnessModel[]` and add `modelId: string | null` to `HarnessPreparationContext`. Update all four harness implementations (OpenCode, Claude Code, Cursor CLI, Codex CLI) to define their model lists (see 'Starter model lists' section) and use `context.modelId` in `prepare()`. Typecheck WILL fail after this todo because `WorkflowExecutionService` hasn't been updated yet."
    status: completed
  - id: server-services-dtos
    content: Update server domain models (`Workspace.ts`, `ProjectsService.ts` Project interface) to use `ScopedHarnessConfig | null` instead of `AgentHarnessId | null`. Update `DatabaseProjectService` (`toProject`, `createProject`, `updateProject`), `DatabaseWorkspacesService` (`toWorkspace`, `updateWorkspace`), and task handler `toTaskDto` to handle `ScopedHarnessConfig` and populate the nested `agentConfig` object in responses. Typecheck may still fail until handlers are updated.
    status: completed
  - id: server-handlers-validation
    content: Update workspace, project, and task handlers to read `agentConfig` instead of `agentHarnessId`. Add model validation (model must belong to the selected harness). Extract a shared `validateAgentConfig` helper. Update GET harnesses endpoint to include `models`. After this todo, the server should typecheck cleanly.
    status: pending
  - id: workflow-execution
    content: Update `WorkflowExecutionService.prepare()` to call `resolveHarnessConfig` instead of `resolveHarnessId`, destructure `{ harnessId, modelId }`, and pass `modelId` into `harness.prepare()`. After this todo, run typecheck for the server -- it should pass.
    status: pending
  - id: frontend-model-select
    content: Create `ModelSelect` component in `apps/frontend/app/components/ui/ModelSelect.tsx` with a 'Harness default' option (using a dedicated sentinel, NOT `INHERIT_VALUE`), model list, and `parseModelValue` helper.
    status: pending
  - id: frontend-dialogs
    content: "Update frontend types (`app/types/task.ts`, `workspace.ts`, `project.ts`) to replace `agentHarnessId` with `agentConfig`. Integrate `ModelSelect` into `WorkspaceConfigDialog`, `ProjectDialog`, and `TaskDialog`: add `modelValue` state, show conditionally when harness is explicit, reset on harness change, submit nested `agentConfig` object (or null for inherit). Update `inheritDisplayName` logic to read from `agentConfig`. After this todo, run typecheck for the full project -- it should pass."
    status: pending
isProject: false
---

# Model Selection

## Context

The system already supports scoped harness selection (workspace / project / task), stored in the `agent_harness_configuration` table with a polymorphic row pattern (exactly one of `workspaceId`, `projectId`, `taskId` is non-null per row). Resolution follows a fallback chain: task -> project -> workspace -> default (`"opencode"`).

Model selection extends this by letting users also pick a model **when they explicitly set a harness** at a given scope. If a user selects "inherit" for the harness, they cannot set a model at that scope -- both inherit together from the parent scope.

Key files the executor needs to know about:

- **API schemas**: `[packages/api/src/workspaces/workspaces-api.ts](packages/api/src/workspaces/workspaces-api.ts)`, `[packages/api/src/projects/projects-api.ts](packages/api/src/projects/projects-api.ts)`, `[packages/api/src/tasks/tasks-api.ts](packages/api/src/tasks/tasks-api.ts)`
- **Harness list endpoint**: defined in `[packages/api/src/workspaces/workspaces-api.ts](packages/api/src/workspaces/workspaces-api.ts)` (`harnessListItemSchema`)
- **DB schema**: `[apps/server/src/db/schema.ts](apps/server/src/db/schema.ts)` (`agentHarnessConfigurationTable`)
- **Config repository**: `[apps/server/src/harness/AgentHarnessConfigRepository.ts](apps/server/src/harness/AgentHarnessConfigRepository.ts)`
- **Harness interface + implementations**: `[apps/server/src/harness/AgentHarness.ts](apps/server/src/harness/AgentHarness.ts)`, `OpenCodeHarness.ts`, `ClaudeCodeHarness.ts`, `CursorCliHarness.ts`, `CodexCliHarness.ts`
- **Workflow execution**: `[apps/server/src/workflow/WorkflowExecutionService.ts](apps/server/src/workflow/WorkflowExecutionService.ts)` (calls `resolveHarnessId` and `harness.prepare()`)
- **Handlers**: `[apps/server/src/workspaces/workspaces-handlers.ts](apps/server/src/workspaces/workspaces-handlers.ts)`, `[apps/server/src/projects/projects-handlers.ts](apps/server/src/projects/projects-handlers.ts)`, `[apps/server/src/tasks/tasks-handlers.ts](apps/server/src/tasks/tasks-handlers.ts)`
- **Services**: `[apps/server/src/projects/DatabaseProjectService.ts](apps/server/src/projects/DatabaseProjectService.ts)`, workspace service (similar pattern)
- **Frontend components**: `[apps/frontend/app/components/ui/HarnessSelect.tsx](apps/frontend/app/components/ui/HarnessSelect.tsx)`, `[apps/frontend/app/components/projects/ProjectDialog.tsx](apps/frontend/app/components/projects/ProjectDialog.tsx)`, `TaskDialog.tsx`, `WorkspaceConfigDialog.tsx`
- **Frontend hooks**: `[apps/frontend/app/lib/workspaces/useWorkspaces.ts](apps/frontend/app/lib/workspaces/useWorkspaces.ts)` (`useHarnessesQuery`)

## Design Decisions

- **Same table**: `agentModelId` is a new nullable text column on `agent_harness_configuration`, not a separate table. This keeps harness and model coupled in one row per scope, simplifying queries and ensuring they inherit together.
- **Nested DTO shape**: The flat `agentHarnessId` field on DTOs is replaced with `agentConfig: { harnessId, modelId } | null`. This makes the coupling structural -- a model cannot be set without a harness, and both inherit together when `agentConfig` is null.
- **Model is coupled to harness at the same scope**: A user can only select a model when they explicitly set a harness (not "inherit"). If harness is null (inherit), model must also be null. This avoids cross-harness model mismatches.
- **Resolution returns both**: `resolveHarnessId` is renamed to `resolveHarnessConfig` and returns `{ harnessId: AgentHarnessId; modelId: string | null }`. The first scope with an explicit harness provides both values.
- **Null model = harness default**: When `modelId` is null, the harness uses its own default (current behaviour). No system-wide default model. In the UI this is shown as "Harness default" (not "Inherit").
- **Static model lists on harness implementations**: Each `AgentHarness` exposes a `models` array. These are returned inline on the existing `GET /harnesses` endpoint. Updated manually as new models drop.
- **Model passed through preparation context**: `HarnessPreparationContext` gains `modelId: string | null`. Each harness implementation uses it to configure the CLI (config file field, CLI flag, or env var).
- **DB migration is user-managed**: The executing agent only updates the Drizzle schema definition. The user handles the actual migration.

## Implementation Guide

**Typecheck note for agents**: These todos are designed to be executed sequentially. Early todos (especially `api-schemas`, `harness-config-repo`, and `harness-interface-impls`) intentionally break type-checking by changing interfaces before their callers are updated. Each todo description notes whether typecheck is expected to pass or fail after completion. Do NOT attempt to fix type errors in code that a later todo is responsible for.

### API schemas (`packages/api/` only)

This todo ONLY changes files in `packages/api/`. Server and frontend consumers will break (type errors) and are fixed by later todos.

Replace the flat `agentHarnessId` field with a nested `agentConfig` object across all DTOs and request schemas. This naturally enforces the constraint that a model requires an explicit harness.

Define a shared schema in `packages/api/src/harnesses/harnesses-model.ts` and export it from `packages/api/src/harnesses/index.ts`:

```typescript
export const agentConfigSchema = z.object({
  harnessId: agentHarnessIdSchema,
  modelId: z.string().nullable(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;
```

Then in each DTO:

- **Response DTOs** (`workspaceDtoSchema`, `projectDtoSchema`, `taskDtoSchema`): replace `agentHarnessId: agentHarnessIdSchema.nullable()` with `agentConfig: agentConfigSchema.nullable()`
- **Request schemas** (create/update for workspace, project, task): replace `agentHarnessId: agentHarnessIdSchema.nullable().optional()` with `agentConfig: agentConfigSchema.nullable().optional()`

Add a `models` array to `harnessListItemSchema`:

```typescript
export const harnessModelSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});

export const harnessListItemSchema = z.object({
  id: agentHarnessIdSchema,
  displayName: z.string(),
  isAvailable: z.boolean(),
  models: z.array(harnessModelSchema),
});
```

### DB schema (migration is out of scope)

Update `[apps/server/src/db/schema.ts](apps/server/src/db/schema.ts)` only -- add `agentModelId: pg.text().$type<string>()` to `agentHarnessConfigurationTable`. The user will handle the actual DB migration separately.

### `AgentHarnessConfigRepository`

Define a shared type for what a config row represents:

```typescript
export type ScopedHarnessConfig = {
  harnessId: AgentHarnessId;
  modelId: string | null;
};
```

Change all getter return types from `AgentHarnessId | null` to `ScopedHarnessConfig | null`. Change all setter signatures to accept `ScopedHarnessConfig | null` (null = delete row). Select both columns in queries:

```typescript
.select({
  agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
  agentModelId: agentHarnessConfigurationTable.agentModelId,
})
```

Rename `resolveHarnessId` to `resolveHarnessConfig`:

```typescript
async resolveHarnessConfig(taskId, projectId, workspaceId): Promise<ScopedHarnessConfig> {
  const [taskConfig, projectConfig, workspaceConfig] = await Promise.all([...]);
  return taskConfig ?? projectConfig ?? workspaceConfig ?? { harnessId: DEFAULT_HARNESS_ID, modelId: null };
}
```

The batch methods (`getProjectConfigs`, `getTaskConfigs`) return `Record<ProjectId, ScopedHarnessConfig | null>` and `Map<TaskId, ScopedHarnessConfig | null>` respectively.

### `AgentHarness` interface and implementations

In `[apps/server/src/harness/AgentHarness.ts](apps/server/src/harness/AgentHarness.ts)`:

- Add `readonly models: readonly HarnessModel[]` to `AgentHarness`
- Define `HarnessModel = { readonly id: string; readonly displayName: string }`
- Add `modelId: string | null` to `HarnessPreparationContext`

Each harness implementation:

- **OpenCode**: Add `models` array (OpenRouter model IDs). In `buildConfig()`, use `context.modelId ?? this.defaultModelId()` for the `model` field. Remove `selectModel()`.
- **Claude Code**: Add `models` array (Anthropic model IDs). If `context.modelId` is set, append `--model ${context.modelId}` to the `runCommand`.
- **Cursor CLI**: Add `models` array. If `context.modelId` is set, append `--model ${context.modelId}` to the `runCommand`.
- **Codex CLI**: Add `models` array (OpenAI model IDs). If `context.modelId` is set, append `--model ${context.modelId}` to the `runCommand`.

Populate each `models` array with these starter lists (the user will manually update these over time):

**OpenCode** (OpenRouter model IDs):

- `{ id: "anthropic/claude-sonnet-4.6", displayName: "Claude Sonnet 4.6" }`
- `{ id: "anthropic/claude-haiku-4.5", displayName: "Claude Haiku 4.5" }`
- `{ id: "google/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro" }`

**Claude Code** (Anthropic model IDs -- these are the aliases that always track the latest patch):

- `{ id: "sonnet", displayName: "Claude Sonnet" }`
- `{ id: "opus", displayName: "Claude Opus" }`
- `{ id: "haiku", displayName: "Claude Haiku" }`

**Cursor CLI** (verify exact ID strings by checking `agent --list-models` if possible):

- `{ id: "claude-4.6-sonnet", displayName: "Claude 4.6 Sonnet" }`
- `{ id: "gemini-3-pro", displayName: "Gemini 3 Pro" }`
- `{ id: "composer-1.5", displayName: "Composer 1.5" }`

**Codex CLI** (OpenAI model IDs):

- `{ id: "gpt-5.4", displayName: "GPT-5.4" }`
- `{ id: "gpt-5.3-codex-spark", displayName: "Codex Spark" }`
- `{ id: "o3", displayName: "o3" }`

### Server handlers

**Validation** (apply in all workspace PATCH, project POST/PATCH, task POST/PUT handlers):

1. Existing harness availability check (`harnessAuthService.isAvailable`) now reads from `body.agentConfig?.harnessId` instead of `body.agentHarnessId`
2. If `agentConfig.modelId` is non-null, look up the harness from `services.harnesses` by `agentConfig.harnessId` and check `harness.models.some(m => m.id === agentConfig.modelId)`. If not found, return `badUserInput("Model X is not available for harness Y")`

The nested `agentConfig` shape eliminates the need to validate "model without harness" -- that state is unrepresentable.

Extract validation into a shared helper (e.g. `validateAgentConfig` in the harness module) to avoid duplicating across handlers.

**Harness list endpoint** (workspace handlers GET harnesses): Include `models: h.models` in the response for each harness.

**Pass-through**: All handlers that pass harness config to services/repository now pass the full `agentConfig` (or convert it to `ScopedHarnessConfig`).

### Services, domain models, and DTO mapping

First, update the server-side domain model types that currently have `agentHarnessId: AgentHarnessId | null`:

- `[apps/server/src/projects/ProjectsService.ts](apps/server/src/projects/ProjectsService.ts)` -- `Project` interface: replace `agentHarnessId: AgentHarnessId | null` with `agentConfig: ScopedHarnessConfig | null`. `CreateProject` and `UpdateProject` derive from `Project` via `Omit`/`Partial`, so they pick up the change automatically.
- `[apps/server/src/workspaces/Workspace.ts](apps/server/src/workspaces/Workspace.ts)` -- `Workspace` type and `UpdateWorkspace` type: same replacement.

Then update the services and DTO mappers:

`**[apps/server/src/projects/DatabaseProjectService.ts](apps/server/src/projects/DatabaseProjectService.ts)`**:

- `toProject(row, config: ScopedHarnessConfig | null)` -> map to `agentConfig: config ? { harnessId: config.harnessId, modelId: config.modelId } : null`
- `createProject` / `updateProject`: extract `agentConfig` from the request, convert to `ScopedHarnessConfig | null`, call `setProjectConfig(projectId, config)`

`**[apps/server/src/workspaces/DatabaseWorkspacesService.ts](apps/server/src/workspaces/DatabaseWorkspacesService.ts)`**: Same pattern -- `toWorkspace` takes `ScopedHarnessConfig | null`, `updateWorkspace` passes config to `setWorkspaceConfig`.

**Task handlers** (`[apps/server/src/tasks/tasks-handlers.ts](apps/server/src/tasks/tasks-handlers.ts)`): `toTaskDto(task, config: ScopedHarnessConfig | null)` -> map to `agentConfig` the same way.

### `WorkflowExecutionService`

Replace:

```typescript
const harnessId = await this.harnessConfig.resolveHarnessId(task.id, project.id, project.workspaceId);
```

With:

```typescript
const { harnessId, modelId } = await this.harnessConfig.resolveHarnessConfig(task.id, project.id, project.workspaceId);
```

Pass `modelId` into `harness.prepare({ ..., modelId })`.

### Frontend `ModelSelect` component

Create `[apps/frontend/app/components/ui/ModelSelect.tsx](apps/frontend/app/components/ui/ModelSelect.tsx)`:

- Props: `value: string`, `onValueChange`, `models: Array<{ id: string; displayName: string }>`, `disabled`, `isLoading`
- A "Harness default" option using a dedicated sentinel (e.g. `HARNESS_DEFAULT_VALUE = "__harness_default__"`). This is **not** `INHERIT_VALUE` -- models don't inherit from a parent scope, they simply fall back to whatever the harness's built-in default is.
- List of models from the selected harness
- Export `parseModelValue(value: string): string | null` mapping the sentinel to `null`

### Frontend types and dialogs

First, update the frontend type files that currently have `agentHarnessId`:

- `apps/frontend/app/types/workspace.ts` -- replace `agentHarnessId: AgentHarnessId | null` with `agentConfig: AgentConfig | null` (import `AgentConfig` from `@mono/api`)
- `apps/frontend/app/types/project.ts` -- same replacement on the `Project` type
- `apps/frontend/app/types/task.ts` -- same replacement on `Task`, `NewTask`, and `UpdateTask`

Then update all three dialogs (`WorkspaceConfigDialog`, `ProjectDialog`, `TaskDialog`):

1. A `modelValue` state alongside `harnessValue`, defaulting to `HARNESS_DEFAULT_VALUE`
2. The `ModelSelect` component shown **only when** `harnessValue !== INHERIT_VALUE` (i.e. a harness is explicitly selected)
3. When `harnessValue` changes, reset `modelValue` to `HARNESS_DEFAULT_VALUE`
4. Filter models from `harnessesData.harnesses.find(h => h.id === harnessValue)?.models ?? []`
5. On submit, construct `agentConfig: harnessValue !== INHERIT_VALUE ? { harnessId: parseHarnessValue(harnessValue), modelId: parseModelValue(modelValue) } : null`

When editing an existing entity, initialize from `entity.agentConfig`:

- `harnessValue`: `entity.agentConfig?.harnessId ?? INHERIT_VALUE`
- `modelValue`: `entity.agentConfig?.modelId ?? HARNESS_DEFAULT_VALUE`

## Edge Cases and Error Handling

- **Model set without harness**: Impossible by DTO shape (`agentConfig` is an object or null). Frontend also prevents this by hiding model select when harness is "inherit".
- **Model not valid for harness**: Server returns 400 with a descriptive message. Frontend prevents this by only showing models for the selected harness.
- **Harness changed, model now invalid**: Frontend resets model to "Harness default" on harness change. Server validates on save.
- **Harness becomes unavailable after model was saved**: Existing behaviour -- harness availability is checked at workflow execution time, not retroactively.
- **Empty model list for a harness**: Model select shows only "Harness default". This is fine -- it means the harness has no user-selectable models.

## Out of Scope

- Dynamic model discovery (API calls to OpenRouter/Anthropic/etc. to list available models)
- Model-specific pricing or capability metadata
- Model-specific credential/API key validation
- Per-model availability checks (all models for an available harness are considered available)
- Searching or filtering models in the dropdown (unless the list becomes very long)

## Todos

See the todo list below -- each represents a focused unit of work.
