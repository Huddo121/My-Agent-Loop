---
name: Model Selection Feature
overview: Add per-harness model selection with the same scoped inheritance pattern (task -> project -> workspace -> harness default) as the existing harness selection, stored in the same DB table and surfaced through the same UI pattern.
todos:
  - id: api-schemas
    content: Add `agentModelId` to all DTOs and request schemas in `packages/api/` (workspace, project, task), and add `models` array + `harnessModelSchema` to `harnessListItemSchema` in `workspaces-api.ts`
    status: pending
  - id: db-migration-schema
    content: Create a DB migration adding nullable `agent_model_id TEXT` column to `agent_harness_configuration`, and update `apps/server/src/db/schema.ts` to include the new column
    status: pending
  - id: harness-config-repo
    content: "Refactor `AgentHarnessConfigRepository` in `apps/server/src/harness/AgentHarnessConfigRepository.ts`: define `ScopedHarnessConfig` type, update all getters to return `ScopedHarnessConfig | null`, update setters to accept `ScopedHarnessConfig | null`, rename `resolveHarnessId` to `resolveHarnessConfig` returning `ScopedHarnessConfig`"
    status: pending
  - id: harness-interface-impls
    content: "Update `AgentHarness` interface to include `models: readonly HarnessModel[]` and add `modelId: string | null` to `HarnessPreparationContext`. Update all four harness implementations (OpenCode, Claude Code, Cursor CLI, Codex CLI) to define their model lists and use `context.modelId` in `prepare()`"
    status: pending
  - id: server-handlers-validation
    content: Add model validation to workspace PATCH, project POST/PATCH, and task POST/PUT handlers. Extract a shared `validateHarnessAndModel` helper. Update the GET harnesses endpoint to include `models` in the response.
    status: pending
  - id: server-services-dtos
    content: Update `DatabaseProjectService` (`toProject`, `createProject`, `updateProject`), workspace service, and task handler `toTaskDto` to handle `ScopedHarnessConfig` and populate `agentModelId` in responses
    status: pending
  - id: workflow-execution
    content: Update `WorkflowExecutionService.prepare()` to call `resolveHarnessConfig` instead of `resolveHarnessId`, destructure `{ harnessId, modelId }`, and pass `modelId` into `harness.prepare()`
    status: pending
  - id: frontend-model-select
    content: Create `ModelSelect` component in `apps/frontend/app/components/ui/ModelSelect.tsx` with inherit/default option, model list, and `parseModelValue` helper, following the `HarnessSelect` pattern
    status: pending
  - id: frontend-dialogs
    content: "Integrate `ModelSelect` into `WorkspaceConfigDialog`, `ProjectDialog`, and `TaskDialog`: add `modelValue` state, show conditionally when harness is explicit, reset on harness change, pass `agentModelId` on submit"
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
- **Model is coupled to harness at the same scope**: A user can only select a model when they explicitly set a harness (not "inherit"). If harness is null (inherit), model must also be null. This avoids cross-harness model mismatches.
- **Resolution returns both**: `resolveHarnessId` is renamed to `resolveHarnessConfig` and returns `{ harnessId: AgentHarnessId; modelId: string | null }`. The first scope with an explicit harness provides both values.
- **Null model = harness default**: When `modelId` is null, the harness uses its own default (current behaviour). No system-wide default model.
- **Static model lists on harness implementations**: Each `AgentHarness` exposes a `models` array. These are returned inline on the existing `GET /harnesses` endpoint. Updated manually as new models drop.
- **Model passed through preparation context**: `HarnessPreparationContext` gains `modelId: string | null`. Each harness implementation uses it to configure the CLI (config file field, CLI flag, or env var).

## Implementation Guide

### API schemas (`packages/api/`)

Add `agentModelId: z.string().nullable()` to all three DTO schemas (`workspaceDtoSchema`, `projectDtoSchema`, `taskDtoSchema`) and the `.nullable().optional()` variant to all create/update request schemas, following the exact pattern of `agentHarnessId`.

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

### DB migration and schema

Add a nullable `agentModelId` text column to the `agent_harness_configuration` table:

- **Migration**: `ALTER TABLE agent_harness_configuration ADD COLUMN agent_model_id TEXT`
- **Schema** (`[apps/server/src/db/schema.ts](apps/server/src/db/schema.ts)`): add `agentModelId: pg.text().$type<string>()` to the table definition

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

Populate each `models` array with a reasonable starter set. The user will manually update these over time.

### Server handlers

**Validation** (apply in all workspace PATCH, project POST/PATCH, task POST/PUT handlers):

1. If `agentModelId` is non-null but `agentHarnessId` is null or undefined (inherit), return `badUserInput("Cannot set a model without explicitly selecting a harness")`
2. If `agentModelId` is non-null, look up the harness from `services.harnesses` by `agentHarnessId` and check `harness.models.some(m => m.id === agentModelId)`. If not found, return `badUserInput("Model X is not available for harness Y")`

Extract validation into a shared helper (e.g. `validateHarnessAndModel` in the harness module) to avoid duplicating across handlers.

**Harness list endpoint** (workspace handlers GET harnesses): Include `models: h.models` in the response for each harness.

**Pass-through**: All handlers that pass `agentHarnessId` to services/repository now also pass `agentModelId`.

### Services and DTO mapping

`**DatabaseProjectService`**:

- `toProject(row, config: ScopedHarnessConfig | null)` -> include both `agentHarnessId: config?.harnessId ?? null` and `agentModelId: config?.modelId ?? null`
- `createProject` / `updateProject`: call `setProjectConfig(projectId, config)` where config includes both harness and model

**Workspace service**: Same pattern -- `toWorkspace` takes config, service methods pass both values.

**Task handlers**: `toTaskDto(task, config: ScopedHarnessConfig | null)` -> include both fields.

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

Create `[apps/frontend/app/components/ui/ModelSelect.tsx](apps/frontend/app/components/ui/ModelSelect.tsx)`, following the same pattern as `HarnessSelect`:

- Props: `value: string`, `onValueChange`, `models: Array<{ id: string; displayName: string }>`, `disabled`, `isLoading`
- An "inherit" / "Harness default" option (value = `INHERIT_VALUE`)
- List of models from the selected harness
- Export `parseModelValue(value: string): string | null` (same pattern as `parseHarnessValue`)

### Frontend dialogs

All three dialogs (`WorkspaceConfigDialog`, `ProjectDialog`, `TaskDialog`) need:

1. A `modelValue` state alongside `harnessValue`, defaulting to `INHERIT_VALUE`
2. The `ModelSelect` component shown **only when** `harnessValue !== INHERIT_VALUE` (i.e. a harness is explicitly selected)
3. When `harnessValue` changes, reset `modelValue` to `INHERIT_VALUE`
4. Filter models from `harnessesData.harnesses.find(h => h.id === harnessValue)?.models ?? []`
5. On submit, `agentModelId: parseModelValue(modelValue)` alongside `agentHarnessId`

The `inheritDisplayName` for the model select is "Harness default" at all scope levels (since null means "let the harness decide").

When editing an existing entity, initialize `modelValue` from the entity's `agentModelId ?? INHERIT_VALUE`.

## Edge Cases and Error Handling

- **Model set without harness**: Server returns 400. Frontend prevents this by hiding model select when harness is "inherit".
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
