# Research: Model Selection Implementation Plan

## Executive Summary

This document outlines the comprehensive work required to add model selection capabilities to the My Agent Loop application. The feature will allow users to:
1. Set a default model for each project
2. Override the project default with a task-specific model selection
3. View and select from available models in the UI

## Current State Analysis

### Model Configuration (Current)
- **Location**: `/code/apps/server/src/workflow/OpenCodeConfigService.ts`
- **Current Behavior**: Hardcoded to use `"opencode/kimi-k2.5-free"`
- **TODO Comment**: Line 101 acknowledges the need for project/task preferences
- **Providers**: OpenRouter (via API key) and Ollama (local models)

### Project Structure
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: `projectsTable` has `workflowConfiguration` (JSONB)
- **API**: Cerato-based endpoints in `/code/packages/api/src/`
- **Frontend**: React Router 7 + React 19

### Data Flow
1. Task is created/updated via API
2. Task is queued for execution
3. `BackgroundWorkflowProcessor` creates a Docker container
4. `OpenCodeConfigService.generateConfig()` creates `opencode.json`
5. Model is currently hardcoded in `selectModel()` method

## Implementation Plan

### Phase 1: Database Schema Changes

#### 1.1 Add Model Fields to Schema
**File**: `/code/apps/server/src/db/schema.ts`

Add `defaultModel` to projects table:
```typescript
export const projectsTable = pg.pgTable("projects", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<ProjectId>(),
  name: pg.text().notNull(),
  shortCode: pg.text().notNull().unique(),
  repositoryUrl: pg.text().notNull(),
  workflowConfiguration: pg.jsonb().notNull().$type<WorkflowConfiguration>(),
  defaultModel: pg.text(), // NEW: Project's default model (nullable)
});
```

Add `model` to tasks table:
```typescript
export const tasksTable = pg.pgTable("tasks", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<TaskId>(),
  title: pg.text().notNull(),
  projectId: pg.uuid().references(() => projectsTable.id).notNull(),
  description: pg.text().notNull(),
  createdAt: pg.timestamp().notNull().defaultNow(),
  completedOn: pg.timestamp(),
  position: pg.doublePrecision(),
  model: pg.text(), // NEW: Task-specific model override (nullable)
});
```

#### 1.2 Create Drizzle Migration
**Command**: `pnpm run migrate:generate` (or equivalent)

This will generate SQL migration files in the drizzle migrations folder.

### Phase 2: TypeScript Type Updates

#### 2.1 Update API Types (Shared Package)
**File**: `/code/packages/api/src/projects/projects-api.ts`

Update project DTO schema:
```typescript
export const projectDtoSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  shortCode: shortCodeCodec,
  repositoryUrl: z.string(),
  workflowConfiguration: workflowConfigurationDtoSchema,
  defaultModel: z.string().nullish(), // NEW
});

export const createProjectRequestSchema = projectDtoSchema.omit({ id: true });
export const updateProjectRequestSchema = createProjectRequestSchema;
```

**File**: `/code/packages/api/src/tasks/tasks-api.ts`

Update task DTO schema:
```typescript
export const taskDtoSchema = z.object({
  id: taskIdSchema,
  title: z.string(),
  description: z.string(),
  completedOn: isoDatetimeToDate.nullish(),
  position: z.number().nullish(),
  model: z.string().nullish(), // NEW
});

export const createTaskRequestSchema = taskDtoSchema.pick({
  title: true,
  description: true,
  model: true, // NEW
});

export const updateTaskRequestSchema = taskDtoSchema.pick({
  title: true,
  description: true,
  model: true, // NEW
});
```

#### 2.2 Update Server Domain Types
**File**: `/code/apps/server/src/projects/ProjectsService.ts`

Update Project interface:
```typescript
export interface Project {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfiguration;
  defaultModel?: string; // NEW
}

type CreateProject = Omit<Project, "id">;
type UpdateProject = Omit<Project, "id">;
```

**File**: `/code/apps/server/src/task-queue/TaskQueue.ts`

Update Task interface:
```typescript
export interface Task {
  id: TaskId;
  title: string;
  description: string;
  completedOn?: Date;
  model?: string; // NEW
}

export type NewTask = Pick<Task, "title" | "description" | "model">; // UPDATED
export type UpdateTask = Pick<Task, "title" | "description" | "model">; // UPDATED
```

#### 2.3 Update Frontend Types
**File**: `/code/apps/frontend/app/types/project.ts`

```typescript
export type Project = {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
  defaultModel?: string; // NEW
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
  workflowConfiguration: WorkflowConfigurationDto;
  defaultModel?: string; // NEW
};
```

**File**: `/code/apps/frontend/app/types/task.ts`

```typescript
export type Task = {
  id: TaskId;
  title: string;
  description: string;
  completedOn: Date | null | undefined;
  model?: string; // NEW
};

export type NewTask = {
  title: string;
  description: string;
  model?: string; // NEW
};

export type UpdateTask = {
  title: string;
  description: string;
  model?: string; // NEW
};
```

### Phase 3: Service Layer Implementation

#### 3.1 Update DatabaseProjectService
**File**: `/code/apps/server/src/projects/DatabaseProjectService.ts`

Update all CRUD operations to handle `defaultModel` field:
- `getAllProjects()`: Include defaultModel in select
- `getProject()`: Include defaultModel in select
- `createProject()`: Insert defaultModel
- `updateProject()`: Update defaultModel
- `deleteProject()`: No changes needed

#### 3.2 Update DatabaseTaskQueue
**File**: `/code/apps/server/src/task-queue/DatabaseTaskQueue.ts`

Update all CRUD operations to handle `model` field:
- `getAllTasks()`: Include model in select
- `getTask()`: Include model in select
- `addTask()`: Insert model
- `updateTask()`: Update model
- `getNextTask()`: Include model in select

#### 3.3 Update OpenCodeConfigService
**File**: `/code/apps/server/src/workflow/OpenCodeConfigService.ts`

Modify `generateConfig()` to accept model parameter:
```typescript
generateConfig(projectId: ProjectId, taskId: TaskId, model?: string): Config {
  const mcpServerConfig: McpRemoteConfig = {
    enabled: true,
    type: "remote",
    url: "http://host.docker.internal:3050/mcp",
    headers: {
      [MAL_PROJECT_ID_HEADER]: projectId,
      [MAL_TASK_ID_HEADER]: taskId,
    },
  };

  return {
    ...baseConfig,
    mcp: {
      "my-agent-loop-tools": mcpServerConfig,
    },
    model: model || baseConfig.model, // Use provided model or fall back to base
  };
}
```

Remove or update the `selectModel()` method since model selection will be handled upstream.

#### 3.4 Update ModelProviderService
**File**: `/code/apps/server/src/providers/ModelProviderServices.ts`

Add method to expose available models:
```typescript
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

export class ModelProviderService {
  // ... existing code ...

  getAvailableModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    
    // Ollama models (always available)
    models.push(
      { id: "ollama/devstral-small-2", name: "Devstral Small 2", provider: "ollama" },
      { id: "ollama/glm-4.7-flash", name: "GLM 4.7 Flash", provider: "ollama" }
    );
    
    // OpenRouter models (if configured)
    if (this.authConfig.openrouter) {
      models.push(
        { id: "openrouter/qwen/qwen3-coder:free", name: "Qwen3 Coder (Free)", provider: "openrouter" },
        { id: "openrouter/opencode/kimi-k2.5-free", name: "Kimi K2.5 (Free)", provider: "openrouter" }
      );
    }
    
    return models;
  }
}
```

### Phase 4: API Layer Updates

#### 4.1 Add Models Endpoint
**New File**: `/code/packages/api/src/models/models-api.ts`

```typescript
import { Endpoint } from "cerato";
import z from "zod";

export const modelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  description: z.string().optional(),
});

export const modelsApi = Endpoint.multi({
  GET: Endpoint.get().output(200, z.array(modelInfoSchema)),
});
```

**File**: `/code/packages/api/src/index.ts`

Export the new models API.

#### 4.2 Implement Models Handler
**New File**: `/code/apps/server/src/models/models-handlers.ts`

```typescript
import { modelsApi } from "@mono/api";
import type { ModelProviderService } from "../providers/ModelProviderServices";

export const createModelsHandlers = (modelProviderService: ModelProviderService) => {
  return modelsApi.handlers({
    GET: async () => {
      const models = modelProviderService.getAvailableModels();
      return { status: 200, body: models };
    },
  });
};
```

#### 4.3 Update Project Handlers
**File**: `/code/apps/server/src/projects/projects-handlers.ts`

Update handler implementations to pass `defaultModel` through create/update operations.

#### 4.4 Update Task Handlers
**File**: `/code/apps/server/src/tasks/tasks-handlers.ts`

Update handler implementations to pass `model` through create/update operations.

#### 4.5 Register New Routes
**File**: `/code/apps/server/src/index.ts` (or routing configuration)

Add the models endpoint to the API router.

### Phase 5: Frontend Implementation

#### 5.1 Create Models Hook
**New File**: `/code/apps/frontend/app/hooks/useModels.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ModelInfo } from "@mono/api";

const fetchModels = async (): Promise<ModelInfo[]> => {
  const response = await fetch("/api/models");
  if (!response.ok) throw new Error("Failed to fetch models");
  return response.json();
};

export const useModels = () => {
  return useQuery({
    queryKey: ["models"],
    queryFn: fetchModels,
  });
};
```

#### 5.2 Update Project Forms
**Files to Update**:
- Project creation form
- Project settings/edit form

Add model selection dropdown:
```typescript
const ModelSelector = () => {
  const { data: models, isLoading } = useModels();
  
  if (isLoading) return <Loading />;
  
  return (
    <select name="defaultModel">
      <option value="">Use System Default</option>
      {models?.map(model => (
        <option key={model.id} value={model.id}>
          {model.name} ({model.provider})
        </option>
      ))}
    </select>
  );
};
```

#### 5.3 Update Task Forms
**Files to Update**:
- Task creation form
- Task edit form

Add model selection dropdown with "Use Project Default" option:
```typescript
const TaskModelSelector = ({ projectId }: { projectId: ProjectId }) => {
  const { data: models, isLoading } = useModels();
  const { data: project } = useProject(projectId);
  
  if (isLoading) return <Loading />;
  
  return (
    <select name="model">
      <option value="">
        Use Project Default {project?.defaultModel && `(${project.defaultModel})`}
      </option>
      {models?.map(model => (
        <option key={model.id} value={model.id}>
          {model.name} ({model.provider})
        </option>
      ))}
    </select>
  );
};
```

#### 5.4 Update Task Display
**Files to Update**:
- Task list view
- Task detail view

Display the effective model for each task (task model || project default || system default).

### Phase 6: Workflow Integration

#### 6.1 Update BackgroundWorkflowProcessor
**File**: `/code/apps/server/src/workflow/BackgroundWorkflowProcessor.ts`

Modify the task execution flow to resolve the model:
```typescript
async processRun(runId: RunId, projectId: ProjectId, taskId: TaskId) {
  // Fetch task and project
  const task = await this.taskQueue.getTask(taskId);
  const project = await this.projectsService.getProject(projectId);
  
  // Resolve model: task > project > system default
  const effectiveModel = task.model || project.defaultModel || "opencode/kimi-k2.5-free";
  
  // Generate config with resolved model
  const config = this.openCodeConfigService.generateConfig(
    projectId, 
    taskId, 
    effectiveModel
  );
  
  // Continue with existing execution flow...
}
```

#### 6.2 Update SandboxService (if needed)
Ensure the model configuration is properly passed through to the Docker container.

### Phase 7: Testing & Validation

#### 7.1 Unit Tests
- Test model resolution logic (task > project > default)
- Test API validation schemas
- Test database queries include model fields

#### 7.2 Integration Tests
- Test project creation with default model
- Test task creation with model override
- Test model API endpoint
- Test end-to-end workflow with custom model

#### 7.3 Manual Testing
- Verify UI model selection works
- Verify model is correctly passed to OpenCode config
- Verify fallback chain works (task -> project -> default)

### Phase 8: Documentation

#### 8.1 Update API Documentation
Document the new fields in:
- Project API endpoints
- Task API endpoints
- New Models API endpoint

#### 8.2 Update User Documentation
Create or update user-facing docs explaining:
- How to set a project default model
- How to override with task-specific models
- Available models and their providers

#### 8.3 Update Architecture Decision Records
**New File**: `/code/docs/decisions/004-model-selection.md`

Document the design decisions:
- Why model is stored at project and task level
- Why we expose available models via API
- Model resolution hierarchy

## Migration Strategy

### Database Migration
1. Generate migration: `pnpm run migrate:generate`
2. Apply migration: `pnpm run migrate:push`
3. Both fields are nullable, so existing data remains valid

### Backward Compatibility
- All model fields are optional/nullable
- Existing projects and tasks work without changes
- Default behavior (using "opencode/kimi-k2.5-free") is preserved

### Rollback Plan
1. Revert code changes
2. Create rollback migration to remove columns
3. Restore previous OpenCodeConfigService behavior

## Files to Modify (Summary)

### Database & Schema
- `/code/apps/server/src/db/schema.ts`
- `/code/apps/server/drizzle/migrations/` (auto-generated)

### API Types (Shared Package)
- `/code/packages/api/src/projects/projects-api.ts`
- `/code/packages/api/src/tasks/tasks-api.ts`
- `/code/packages/api/src/models/models-api.ts` (NEW)
- `/code/packages/api/src/index.ts`

### Server Implementation
- `/code/apps/server/src/projects/ProjectsService.ts`
- `/code/apps/server/src/projects/DatabaseProjectService.ts`
- `/code/apps/server/src/projects/projects-handlers.ts`
- `/code/apps/server/src/task-queue/TaskQueue.ts`
- `/code/apps/server/src/task-queue/DatabaseTaskQueue.ts`
- `/code/apps/server/src/tasks/tasks-handlers.ts`
- `/code/apps/server/src/providers/ModelProviderServices.ts`
- `/code/apps/server/src/workflow/OpenCodeConfigService.ts`
- `/code/apps/server/src/workflow/BackgroundWorkflowProcessor.ts`
- `/code/apps/server/src/models/models-handlers.ts` (NEW)
- `/code/apps/server/src/index.ts` (routing)

### Frontend
- `/code/apps/frontend/app/types/project.ts`
- `/code/apps/frontend/app/types/task.ts`
- `/code/apps/frontend/app/hooks/useModels.ts` (NEW)
- Project creation/edit forms
- Task creation/edit forms
- Task list/detail views

### Documentation
- `/code/docs/decisions/004-model-selection.md` (NEW)
- Update existing API docs

## Estimated Effort

| Phase | Estimated Time | Complexity |
|-------|---------------|------------|
| Phase 1: Database | 2 hours | Low |
| Phase 2: Type Updates | 3 hours | Low |
| Phase 3: Services | 4 hours | Medium |
| Phase 4: API Layer | 3 hours | Medium |
| Phase 5: Frontend | 6 hours | Medium |
| Phase 6: Workflow | 2 hours | Medium |
| Phase 7: Testing | 4 hours | Medium |
| Phase 8: Documentation | 2 hours | Low |
| **Total** | **~26 hours** | **Medium** |

## Open Questions

1. **Model Catalog**: Should we fetch available models dynamically from OpenRouter API, or maintain a static list?
2. **Model Validation**: Should we validate that selected models are available at creation time, or at runtime?
3. **Pricing/Cost**: Should we display cost information for different models?
4. **Model Capabilities**: Should we store and display model capabilities (tool calling, reasoning, context length)?
5. **Caching**: Should we cache the models list, and for how long?

## Recommendations

1. **Start with static model list**: Hardcode available models initially, add dynamic fetching later
2. **Lazy validation**: Validate model availability at runtime rather than at creation
3. **Phase rollout**: 
   - Phase 1: Backend changes (database, API, services)
   - Phase 2: Frontend changes (UI, forms)
   - Phase 3: Testing and documentation
4. **Feature flags**: Consider adding a feature flag to enable/disable model selection during rollout

## Conclusion

The implementation of model selection is straightforward and follows existing patterns in the codebase. The main complexity lies in:
- Coordinating changes across multiple layers (DB, API, services, frontend)
- Ensuring proper model resolution hierarchy (task > project > default)
- Maintaining backward compatibility

With approximately 26 hours of work, this feature can be fully implemented and tested.
