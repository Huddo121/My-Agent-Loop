---
name: Subtasks
overview: Add subtasks as an ordered list stored on the Task row (JSONB). Subtasks have id, title, optional description, and state (pending/in-progress/completed/cancelled matching Cursor plan states). Last-write-wins for concurrent updates. Includes API schemas, DB column, HTTP and MCP handlers, task.txt generation, and full frontend UI.
todos:
  - id: api-subtask-types
    content: "Add subtask types and schemas to `packages/api/src/tasks/tasks-model.ts` and update `packages/api/src/tasks/tasks-api.ts`. Read both files first. (1) In `tasks-model.ts`, add: `subtaskIdSchema`, `SubtaskId`, `subtaskStateSchema`, `SubtaskState`, `subtaskSchema`, `Subtask`. (2) In `tasks-api.ts`, add `subtasks: z.array(subtaskSchema)` to `taskDtoSchema`. Add `subtasks: z.array(subtaskSchema).optional()` to both `createTaskRequestSchema` and `updateTaskRequestSchema`. See plan section 1."
    status: completed
  - id: db-schema
    content: "Add the `subtasks` JSONB column to the tasks table in `apps/server/src/db/schema.ts`. Read the file first. The column stores an array of subtasks: `Subtask[]`. Add `subtasks: pg.jsonb().notNull().default(sql`'[]'::jsonb`).$type<Subtask[]>()`, importing `Subtask` from `@mono/api`. Place it after the `description` column. Do NOT generate a database migration file -- humans will do that."
    status: completed
  - id: server-task-model-and-queue
    content: "Update the server-side task model and DatabaseTaskQueue. Read both files first. (1) In `TaskQueue.ts`: add `subtasks: Subtask[]` to `Task`. `NewTask` and `UpdateTask` extend with `subtasks?: Subtask[]`. (2) In `DatabaseTaskQueue.ts`: update `fromTaskEntity` to map `subtasks: (task.subtasks as Subtask[]) ?? []`. For addTask and updateTask, pass subtasks through to Drizzle — last-write-wins, no version check. See plan section 2."
    status: completed
  - id: server-http-handlers
    content: "Update the HTTP task handlers. Read `apps/server/src/tasks/tasks-handlers.ts` first. (1) Update `toTaskDto()` to include `subtasks: task.subtasks`. (2) In the POST handler, pass `subtasks: ctx.body.subtasks ?? []`. (3) In the PUT handler, pass `subtasks: ctx.body.subtasks` through to `updateTask`. See plan section 3."
    status: completed
  - id: mcp-subtask-tools
    content: "Add MCP tools for agents to manage subtasks. Read `apps/server/src/tasks/tasks-mcp-handlers.ts` first. (1) 'Create subtask': input `taskId`, `title`, optional `description`. Load task, append new subtask with generated ID, save via `taskQueue.updateTask()` with new subtasks array. Return created subtask as JSON. (2) 'Update subtask': input `taskId`, `subtaskId`, optional `title`, `description`, `state`. Load task, find subtask by ID, apply changes, save. Return error JSON if task or subtask not found. (3) Add both to `tasksMcpTools`. Get tasks response includes `subtasks`. See plan section 4."
    status: completed
  - id: task-file-generation
    content: Update `formatTaskFile` in `apps/server/src/workflow/WorkflowExecutionService.ts` to include subtasks. Read the file first. If the task has subtasks, append a '## Subtasks' section with a series of YAML objects (matching Cursor's plan format). Each subtask object has explicit `id`, `title`, `description` (optional), and `status` (pending, in-progress, completed, cancelled) — no cryptic single-character markers. Use a YAML library to serialize; add `yaml` via pnpm if not present. See plan section 5 for the exact format and example output.
    status: completed
  - id: frontend-types-and-hooks
    content: "Update frontend types and React Query hooks. (1) In `apps/frontend/app/types/task.ts`: add `SubtaskState`, `SubtaskId`, `Subtask`; add `subtasks: Subtask[]` to `Task`; add `subtasks?: Subtask[]` to `NewTask` and `UpdateTask`. (2) In `useTasks.ts`: hooks pass through full objects, so subtasks will flow automatically once types are updated. No special handling needed."
    status: completed
  - id: frontend-task-dialog
    content: "Add subtask management UI to the TaskDialog. Read `apps/frontend/app/components/tasks/TaskDialog.tsx` first. **Use the Shadcn skill and the Frontend Design skill when building this UI.** Add a 'Subtasks' section below the description textarea with: (1) List of subtasks (title input, optional description, state badge, remove button). (2) 'Add subtask' button. (3) Drag-and-drop reordering via dnd-kit — the project already uses dnd-kit for task reordering (TaskQueue, SortableTaskCard); follow that pattern for subtasks inside the dialog (DndContext, SortableContext, verticalListSortingStrategy, each subtask as a sortable item with a drag handle). (4) When editing, populate subtasks from `task.subtasks`. (5) On submit, include `subtasks` in the payload. Keep the dialog scrollable. See plan section 6."
    status: completed
  - id: frontend-task-card
    content: Add a subtask progress indicator to TaskCard. Read `apps/frontend/app/components/tasks/TaskCard.tsx` first. **Use the Shadcn skill and the Frontend Design skill when building this UI.** If the task has subtasks (non-empty array), render a compact progress indicator below the task title. Show completed count vs total (e.g. '2/5 subtasks') and optionally a small progress bar. Keep it minimal -- the card is 240px wide. Only show this when subtasks exist; tasks without subtasks look exactly as they do today. See plan section 7.
    status: completed
isProject: false
---

# Subtasks

## 1. Context

### What the system does today

Tasks are the core work unit in My Agent Loop. Each task has a `title`, `description`, and metadata (`completedOn`, `position`). Tasks live in the `tasksTable` (PostgreSQL, via Drizzle ORM) and are managed through the `TaskQueue` interface.

When a task is handed to an agent, `formatTaskFile()` in `WorkflowExecutionService.ts` writes a `task.txt` file containing:

```
# Task Title

Task description
```

This file is mounted at `/task.txt` in the agent's Docker container.

The API layer uses Zod schemas in `packages/api` with cerato for end-to-end typesafety. The frontend is a React SPA using React Query for data fetching, Shadcn for components, and Tailwind for styles.

### Why subtasks

Subtasks break a task into smaller, ordered steps. An agent is expected to work through them sequentially (top to bottom). Subtask states (`pending`, `in-progress`, `completed`, `cancelled`) intentionally match Cursor plan todo states, enabling future Cursor plan import.

Subtasks are an inseparable part of a task and are stored as a JSONB array on the task row. No separate table is needed.

### Future execution model (informational, not in scope for this plan)

In a future iteration, tasks with subtasks will execute each subtask as a **separate agent loop** with a clean context window, all on the **same branch**. This means:

- The branch is created once when the task starts
- Each subtask gets its own agent invocation (fresh context)
- The agent for each subtask picks up where the previous one left off on the same branch

For now, all subtasks are included in the task file and the agent handles them in a single run. **The implementing agent should be aware of this future direction** — it means subtask IDs and state management need to be robust enough to support per-subtask execution later.

### Key files and their roles


| Area                 | File                                                   | Role                                                                   |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| DB schema            | `apps/server/src/db/schema.ts`                         | Drizzle table definitions (lines 57–70 for tasks)                      |
| Task queue interface | `apps/server/src/task-queue/TaskQueue.ts`              | `Task`, `NewTask`, `UpdateTask` types + `TaskQueue` interface          |
| Task queue impl      | `apps/server/src/task-queue/DatabaseTaskQueue.ts`      | Drizzle-based implementation of TaskQueue                              |
| Task queue barrel    | `apps/server/src/task-queue/index.ts`                  | Exports `DatabaseTaskQueue`, `NewTask`, `Task`, `TaskQueue`            |
| API model            | `packages/api/src/tasks/tasks-model.ts`                | `TaskId` branded type, `taskIdSchema`                                  |
| API endpoints        | `packages/api/src/tasks/tasks-api.ts`                  | `TaskDto`, request/response schemas, endpoint definitions              |
| API barrel           | `packages/api/src/index.ts`                            | Re-exports from `tasks-api` and `tasks-model`                          |
| HTTP handlers        | `apps/server/src/tasks/tasks-handlers.ts`              | Hono route handlers for task CRUD                                      |
| MCP handlers         | `apps/server/src/tasks/tasks-mcp-handlers.ts`          | MCP tools for agents (Get tasks, Mark complete, Add task)              |
| MCP registration     | `apps/server/src/mcp.ts`                               | `mcpServer.addTools(tasksMcpTools)` on line 48                         |
| Task file creation   | `apps/server/src/workflow/WorkflowExecutionService.ts` | `formatTaskFile()` at lines 21–26                                      |
| Frontend types       | `apps/frontend/app/types/task.ts`                      | Frontend `Task`, `NewTask`, `UpdateTask` types                         |
| Frontend type barrel | `apps/frontend/app/types/index.ts`                     | Re-exports from `task.ts`                                              |
| Frontend hooks       | `apps/frontend/app/hooks/useTasks.ts`                  | React Query hooks for task API                                         |
| Task dialog          | `apps/frontend/app/components/tasks/TaskDialog.tsx`    | Create/edit task dialog (form with title, description, harness config) |
| Task card            | `apps/frontend/app/components/tasks/TaskCard.tsx`      | Single task card rendered in the queue list                            |


## 2. Design Decisions

1. **Storage: JSONB column on tasks table** — Subtasks are stored as a `subtasks` JSONB column containing `Subtask[]`. Default: `'[]'::jsonb`. Last-write-wins for concurrent updates.
2. **Subtask IDs: short random hex strings** — Generated via `crypto.randomUUID().slice(0, 8)` (8-character hex string). IDs are generated at the point of creation: the frontend generates them when users add subtasks in the dialog; MCP handlers generate them when agents create subtasks. No external dependency needed — `crypto.randomUUID()` is built-in to both Node.js and browsers.
3. **Subtask state enum** — `'pending' | 'in-progress' | 'completed' | 'cancelled'`. Intentionally matches Cursor plan todo states for future import compatibility.
4. **Subtask description is optional** — Subtasks can be lightweight title-only items or have detailed descriptions.
5. **Ordering: array index** — Subtasks are ordered by their position in the JSON array. No separate `position` field. Reordering means reordering the array.
6. **HTTP API: full array replacement** — When creating or updating a task via HTTP, the client sends the full `subtasks` array. The server stores it as-is. Simple and sufficient for the frontend use case.
7. **MCP API: granular operations** — Agents use dedicated MCP tools (`Create subtask`, `Update subtask`) for single-subtask operations. The MCP handler does a read-modify-write on the JSONB array within a transaction.
8. **Task completion: unchanged** — Task completion still happens when the agent run finishes successfully (in `WorkflowExecutionService`). No auto-complete-on-all-subtasks-done logic for now.
9. **Branded SubtaskId** — Use a branded string type for `SubtaskId` in `packages/api` (same pattern as `TaskId`), giving type safety at the boundary.

## 3. Implementation Guide

### Section 1: API subtask types (`packages/api`)

In `packages/api/src/tasks/tasks-model.ts`, add after the existing `TaskId` type:

```typescript
export const subtaskIdSchema = z.string().brand<"SubtaskId">();
export type SubtaskId = z.infer<typeof subtaskIdSchema>;

export const subtaskStateSchema = z.enum([
  "pending",
  "in-progress",
  "completed",
  "cancelled",
]);
export type SubtaskState = z.infer<typeof subtaskStateSchema>;

export const subtaskSchema = z.object({
  id: subtaskIdSchema,
  title: z.string(),
  description: z.string().optional(),
  state: subtaskStateSchema,
});
export type Subtask = z.infer<typeof subtaskSchema>;
```

In `packages/api/src/tasks/tasks-api.ts`:

- Add `subtasks: z.array(subtaskSchema)` to `taskDtoSchema` (import `subtaskSchema` from `./tasks-model`)
- Add `subtasks: z.array(subtaskSchema).optional()` to both `createTaskRequestSchema` and `updateTaskRequestSchema`

### Section 2: Server task model and queue

`**apps/server/src/task-queue/TaskQueue.ts`:**

Add to the `Task` interface: `subtasks: Subtask[]`. `NewTask` and `UpdateTask` extend with `subtasks?: Subtask[]`. Import `Subtask` from `@mono/api`.

`**apps/server/src/task-queue/DatabaseTaskQueue.ts`:**

The JSONB column stores `Subtask[]`. Update `fromTaskEntity`: `subtasks: (task.subtasks as Subtask[]) ?? []`. For `addTask` and `updateTask`, pass subtasks through to Drizzle. Last-write-wins — no version check.

`**apps/server/src/task-queue/index.ts`:**

The barrel currently exports `NewTask`, `Task`, `TaskQueue`. No changes needed since `Subtask` is imported from `@mono/api`, not from this module.

### Section 3: HTTP handlers

`**apps/server/src/tasks/tasks-handlers.ts`:**

Update `toTaskDto()` to include `subtasks`. In the POST handler, pass `subtasks: ctx.body.subtasks ?? []` into `addTask`. In the PUT handler, pass `subtasks: ctx.body.subtasks` through to `updateTask`.

### Section 4: MCP subtask tools

In `apps/server/src/tasks/tasks-mcp-handlers.ts`, add two new tools following the exact same pattern as the existing tools in that file (`satisfies McpTool`, `getMcpServices()`, `withNewTransaction`).

**Create subtask tool:**

```typescript
import crypto from "node:crypto";
import { subtaskStateSchema, type Subtask, type SubtaskId } from "@mono/api";

const createSubtaskSchema = z.object({
  taskId: z.string().describe("The ID of the task to add a subtask to"),
  title: z.string().describe("The title of the subtask"),
  description: z
    .string()
    .optional()
    .describe("Optional description of the subtask"),
});

export const createSubtaskMcpHandler = {
  name: "Create subtask",
  description:
    "Add a new subtask to a task. The subtask is appended to the end of the task's subtask list with state 'pending'.",
  parameters: createSubtaskSchema,
  execute: async (params) => {
    const services = getMcpServices();
    return withNewTransaction(services.db, async () => {
      const task = await services.taskQueue.getTask(params.taskId as TaskId);
      if (!task) {
        return JSON.stringify({
          result: "error",
          reason: `Task with id ${params.taskId} not found`,
        });
      }

      const newSubtask: Subtask = {
        id: crypto.randomUUID().slice(0, 8) as SubtaskId,
        title: params.title,
        description: params.description,
        state: "pending",
      };

      const updatedSubtasks = [...task.subtasks, newSubtask];
      await services.taskQueue.updateTask(task.id, {
        title: task.title,
        description: task.description,
        subtasks: updatedSubtasks,
      });

      return JSON.stringify(newSubtask);
    });
  },
} as const satisfies McpTool<typeof createSubtaskSchema>;
```

**Update subtask tool:**

```typescript
const updateSubtaskSchema = z.object({
  taskId: z.string().describe("The ID of the task containing the subtask"),
  subtaskId: z.string().describe("The ID of the subtask to update"),
  title: z.string().optional().describe("New title for the subtask"),
  description: z
    .string()
    .optional()
    .describe("New description for the subtask"),
  state: subtaskStateSchema
    .optional()
    .describe("New state: pending, in-progress, completed, or cancelled"),
});

export const updateSubtaskMcpHandler = {
  name: "Update subtask",
  description:
    "Update a subtask's title, description, or state. Only the fields provided will be changed.",
  parameters: updateSubtaskSchema,
  execute: async (params) => {
    const services = getMcpServices();
    return withNewTransaction(services.db, async () => {
      const task = await services.taskQueue.getTask(params.taskId as TaskId);
      if (!task) {
        return JSON.stringify({
          result: "error",
          reason: `Task with id ${params.taskId} not found`,
        });
      }

      const subtaskIndex = task.subtasks.findIndex(
        (s) => s.id === params.subtaskId,
      );
      if (subtaskIndex === -1) {
        return JSON.stringify({
          result: "error",
          reason: `Subtask with id ${params.subtaskId} not found in task ${params.taskId}`,
        });
      }

      const updatedSubtask = { ...task.subtasks[subtaskIndex] };
      if (params.title !== undefined) updatedSubtask.title = params.title;
      if (params.description !== undefined)
        updatedSubtask.description = params.description;
      if (params.state !== undefined) updatedSubtask.state = params.state;

      const updatedSubtasks = [...task.subtasks];
      updatedSubtasks[subtaskIndex] = updatedSubtask;

      await services.taskQueue.updateTask(task.id, {
        title: task.title,
        description: task.description,
        subtasks: updatedSubtasks,
      });

      return JSON.stringify(updatedSubtask);
    });
  },
} as const satisfies McpTool<typeof updateSubtaskSchema>;
```

Add both to the existing `tasksMcpTools` array:

```typescript
export const tasksMcpTools = [
  getTasksMcpHandler,
  markTaskCompletedHandler,
  addTaskMcpHandler,
  createSubtaskMcpHandler,
  updateSubtaskMcpHandler,
] as McpTools;
```

No changes needed in `apps/server/src/mcp.ts` — it already calls `mcpServer.addTools(tasksMcpTools)`, and the new tools are added to that array.

Also update the existing `getTasksMcpHandler`'s response mapping to include `subtasks` and `subtasksVersion`:

```typescript
const response = tasks.map((task) => ({
  id: task.id,
  description: task.description,
  title: task.title,
  completedOn: task.completedOn?.toISOString(),
  subtasks: task.subtasks,
}));
```

### Section 5: Task file generation

In `apps/server/src/workflow/WorkflowExecutionService.ts`, update `formatTaskFile`. **Do not use creative single-character markers** (e.g. `[ ]`, `[x]`) — agents cannot be expected to infer their meaning. Instead, **copy Cursor's plan format**: emit subtasks as a series of YAML objects with explicit `id`, `title`, `description` (optional), and `status` fields. Use `status` in the output (matching Cursor's terminology) — values are the same as our `state`: `pending`, `in-progress`, `completed`, `cancelled`.

Use a YAML library (e.g. `yaml` from `npm`, or a simple manual emit) to serialize the subtasks array. Each subtask becomes a YAML object. Append this block after the main task title and description.

```typescript
const formatTaskFile = (task: Task): string => {
  let content = `# ${task.title}\n\n${task.description}\n`;

  if (task.subtasks.length > 0) {
    content += "\n## Subtasks\n\n";
    const subtasksYaml = task.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      ...(s.description ? { description: s.description } : {}),
      status: s.state, // map our 'state' to 'status' for Cursor compatibility
    }));
    content += formatSubtasksAsYaml(subtasksYaml);
  }

  return content;
};
```

Example output with subtasks (YAML format matching Cursor plans):

```yaml
# Refactor authentication module

Migrate from session-based auth to JWT tokens across all API endpoints.

## Subtasks

- id: a1b2c3d4
  title: Extract token generation into a dedicated service
  description: Move the JWT signing logic out of the auth controller into a TokenService class.
  status: pending
- id: e5f6g7h8
  title: Update middleware to validate JWT tokens
  status: in-progress
- id: i9j0k1l2
  title: Add refresh token rotation
  status: completed
- id: m3n4o5p6
  title: Remove session store dependency
  status: cancelled
```

Use `yaml` (or equivalent) to serialize — ensure proper escaping for multiline strings. If the project does not have a YAML dependency, add one via `pnpm add yaml` in the server package, or emit the YAML manually with correct indentation and string quoting.

### Section 6: Frontend TaskDialog subtask UI

**Important: The implementing agent MUST use the Shadcn skill and the Frontend Design skill when building this UI.**

Read `apps/frontend/AGENTS.md` before making changes. Key conventions:

- Use Shadcn components (e.g. `Button`, `Input`, `Badge`) — run `pnpm shadcn add <component>` if needed
- Split pure rendering from connected components
- Don't mutate props — create copies before modifying

**Layout within TaskDialog (`apps/frontend/app/components/tasks/TaskDialog.tsx`):**

Add a `subtasks` local state (`useState<Subtask[]>`) alongside the existing `title`, `description`, `harnessValue`, `modelValue` state.

Below the description textarea and above the Agent Harness section, add a "Subtasks" section:

```
┌─────────────────────────────────────┐
│ Title: [___________________________]│
│                                     │
│ Description: [_____________________]│
│              [_____________________]│
│                                     │
│ Subtasks                            │
│ ┌─────────────────────────────────┐ │
│ │ ⋮⋮ [Title input_____] [🗑️]   │ │
│ │    [Description (opt)]          │ │
│ │    State: ● pending             │ │
│ ├─────────────────────────────────┤ │
│ │ ⋮⋮ [Title input_____] [🗑️]   │ │
│ │    State: ● pending             │ │
│ └─────────────────────────────────┘ │
│ [+ Add subtask]                     │
│                                     │
│ Agent Harness: [inherit ▾]          │
│                                     │
│         [Cancel]  [Add Task]        │
└─────────────────────────────────────┘
```

Key behaviors:

- **Add subtask**: Appends a new subtask with `id: crypto.randomUUID().slice(0, 8)`, empty title, no description, state `'pending'`.
- **Remove subtask**: Removes from the array by ID.
- **Reorder**: Use dnd-kit for drag-and-drop — the project already uses it for task reordering in `TaskQueue.tsx` (DndContext, SortableContext, SortableTaskCard, verticalListSortingStrategy). Create a similar SortableSubtaskItem component that wraps each subtask row with `useSortable`, provides a drag handle (e.g. GripVertical icon), and updates the subtasks array on `onDragEnd` via `arrayMove`. Use the subtask's `id` as the sortable item id.
- **State display**: Show state as a small read-only badge (`Badge` component from Shadcn). Users set state to `pending` on creation; agents change state via MCP. In edit mode, the current state should be visible. Optionally allow manual state changes if the user wants to pre-set states, but this is not required for v1.
- **Populate on edit**: In the `useEffect` that runs when `open` changes, set `subtasks` from `task.subtasks` (or `[]` if creating).
- **Submit**: Include `subtasks` in the object passed to `onSubmit`.

Subtask ID generation on the frontend:

```typescript
const generateSubtaskId = () => crypto.randomUUID().slice(0, 8);
```

### Section 7: Frontend TaskCard subtask indicator

**Important: The implementing agent MUST use the Shadcn skill and the Frontend Design skill when building this UI.**

In `apps/frontend/app/components/tasks/TaskCard.tsx`, add a subtask progress indicator below the title.

Only render when the task has subtasks (`task.subtasks.length > 0`). Show:

- Completed count vs total: e.g. "2/5 subtasks"
- Optionally a small inline progress bar (using Shadcn's `Progress` component if available, or a simple styled div)

Count "completed" as subtasks with `state === 'completed'`. Cancelled subtasks count toward the total but not toward completed (they represent work that was intentionally skipped).

The card is 240px wide, so keep the indicator compact. A single line like:

```
┌──────────────────────────────────┐
│ Task title                   [✓] │
│ ████████░░░░  2/5 subtasks       │
└──────────────────────────────────┘
```

The `Task` type on the frontend (`apps/frontend/app/types/task.ts`) will now have `subtasks: Subtask[]`. Since the prop type is `Task`, the card automatically receives subtask data — no changes to `TaskQueue.tsx` or `SortableTaskCard.tsx` are needed beyond the type update.

## 4. Edge Cases and Error Handling

- **Empty subtasks array**: Tasks with no subtasks use `[]`. `formatTaskFile` only appends the subtasks section if the array is non-empty. The TaskCard only shows the progress indicator if subtasks exist.
- **MCP: task not found**: Return `{ result: "error", reason: "Task with id X not found" }`.
- **MCP: subtask not found**: Return `{ result: "error", reason: "Subtask with id X not found in task Y" }`.
- **Subtask ID collisions**: With 8 hex characters, collisions within a single task's subtask array are extremely unlikely. No special handling needed.
- **DB migration for existing rows**: The `subtasks` column defaults to `'[]'::jsonb`, so existing task rows get an empty array. No data migration needed.

## 5. Out of Scope

- **Subtask-level execution model**: Running each subtask as its own agent loop with a clean context window. This is the next major feature after this one.
- **Auto-completing a task when all subtasks are completed**: Deferred until the subtask execution model is built.
- **Cursor plan import**: The subtask states are designed for compatibility, but the import feature itself is separate.
- **Subtask-level agent harness configuration**: Subtasks inherit the task's harness config.
- **Subtask description as a rich text / markdown editor**: Plain text input is fine for v1.

