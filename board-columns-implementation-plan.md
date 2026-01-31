# Board Columns Implementation Plan

## Overview

This document outlines the research and implementation plan for adding board columns to the task management system. The goal is to implement a Kanban-style board with the following columns:

1. Backlog
2. Ready
3. In progress
4. In review (only visible for review mode)
5. Done

## Current System Analysis

### Task Model
- **Current State**: Tasks have a simple `completedOn` timestamp field
- **Position**: Tasks use a `position` field (double precision) for ordering within the queue
- **No Column Concept**: Currently, there's no concept of columns or stages

### Work Queue Behavior
- **Current**: `getNextTask()` picks the first incomplete task by position
- **Completion**: `completeTask()` sets `completedOn` and clears `position`
- **No Column Filtering**: The queue doesn't filter by column/state

### Project Mode (Review vs Non-Review)
- **Review Mode**: `workflowConfiguration.onTaskCompleted === "push-branch"`
  - Creates a branch for review (cannot loop)
  - Should show "In review" column
- **Non-Review Mode**: `workflowConfiguration.onTaskCompleted === "merge-immediately"`
  - Merges immediately (can loop)
  - Should skip "In review" column, go directly to "Done"

### Task Run Lifecycle
- **States**: pending → in_progress → completed/failed
- **Current Behavior**: On successful completion, task is marked as completed
- **No Column Transition**: Currently no concept of moving between columns

## Implementation Plan

### Phase 1: Database Schema Changes

#### 1.1 Add Column Enum
**File**: `/code/apps/server/src/db/schema.ts`

Add a new enum for task columns:

```typescript
export const taskColumnEnum = pg.pgEnum("task_column", [
  "backlog",
  "ready", 
  "in_progress",
  "in_review",
  "done",
]);
```

#### 1.2 Update Tasks Table
**File**: `/code/apps/server/src/db/schema.ts`

Add column field to tasks table:

```typescript
export const tasksTable = pg.pgTable("tasks", {
  id: pg.uuid().primaryKey().default(sql`uuidv7()`).$type<TaskId>(),
  title: pg.text().notNull(),
  projectId: pg
    .uuid()
    .references(() => projectsTable.id)
    .notNull(),
  description: pg.text().notNull(),
  createdAt: pg.timestamp().notNull().defaultNow(),
  completedOn: pg.timestamp(),
  /** The column/stage this task is in */
  column: taskColumnEnum().notNull().default("backlog"),
  /** Where does this task appear in the queue? Only relevant for non-completed tasks. */
  position: pg.doublePrecision(),
});
```

#### 1.3 Create Database Migration
Run drizzle migration to apply schema changes:

```bash
pnpm run drizzle generate
pnpm run drizzle migrate
```

### Phase 2: API Layer Updates

#### 2.1 Update Task DTO Schema
**File**: `/code/packages/api/src/tasks/tasks-api.ts`

Add column to task DTO:

```typescript
export const taskColumnSchema = z.enum([
  "backlog",
  "ready",
  "in_progress", 
  "in_review",
  "done",
]);
export type TaskColumn = z.infer<typeof taskColumnSchema>;

export const taskDtoSchema = z.object({
  id: taskIdSchema,
  title: z.string(),
  description: z.string(),
  completedOn: isoDatetimeToDate.nullish(),
  column: taskColumnSchema,
  position: z.number().nullish(),
});
```

#### 2.2 Add Move Task to Column Endpoint
**File**: `/code/packages/api/src/tasks/tasks-api.ts`

Add new endpoint for moving tasks between columns:

```typescript
export const moveTaskToColumnRequestSchema = z.object({
  column: taskColumnSchema,
  position: z.enum(["first", "last"]).optional(),
});
export type MoveTaskToColumnRequest = z.infer<typeof moveTaskToColumnRequestSchema>;

// In tasksApi children:
children: {
  // ... existing endpoints
  moveToColumn: Endpoint.post()
    .input(moveTaskToColumnRequestSchema)
    .output(200, taskDtoSchema)
    .output(404, notFoundSchema),
}
```

### Phase 3: Backend Service Updates

#### 3.1 Update Task Interface
**File**: `/code/apps/server/src/task-queue/TaskQueue.ts`

Update Task interface and add new methods:

```typescript
export type TaskColumn = "backlog" | "ready" | "in_progress" | "in_review" | "done";

export interface Task {
  id: TaskId;
  title: string;
  description: string;
  completedOn?: Date;
  column: TaskColumn;
}

export interface TaskQueue {
  // ... existing methods
  
  /**
   * Get tasks filtered by column
   */
  getTasksByColumn(projectId: ProjectId, column: TaskColumn): Promise<Task[]>;
  
  /**
   * Move task to a specific column
   */
  moveTaskToColumn(
    id: TaskId, 
    column: TaskColumn, 
    position?: "first" | "last"
  ): Promise<Task | undefined>;
  
  /**
   * Get next task from Ready column specifically
   */
  getNextReadyTask(projectId: ProjectId): Promise<Task | undefined>;
}
```

#### 3.2 Implement DatabaseTaskQueue Methods
**File**: `/code/apps/server/src/task-queue/DatabaseTaskQueue.ts`

Implement the new methods:

```typescript
export class DatabaseTaskQueue implements TaskQueue {
  // ... existing methods

  async getTasksByColumn(
    projectId: ProjectId, 
    column: TaskColumn
  ): Promise<Task[]> {
    const tx = getTransaction();
    const tasks = await tx
      .select()
      .from(tasksTable)
      .where(and(
        eq(tasksTable.projectId, projectId),
        eq(tasksTable.column, column)
      ))
      .orderBy(asc(tasksTable.position), asc(tasksTable.id));
    return tasks.map(fromTaskEntity);
  }

  async getNextReadyTask(projectId: ProjectId): Promise<Task | undefined> {
    const tx = getTransaction();
    const foundTasks = await tx
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.projectId, projectId),
          eq(tasksTable.column, "ready")
        )
      )
      .orderBy(asc(tasksTable.position), asc(tasksTable.id))
      .limit(1);

    return foundTasks.map(fromTaskEntity).shift();
  }

  async moveTaskToColumn(
    id: TaskId,
    column: TaskColumn,
    position?: "first" | "last"
  ): Promise<Task | undefined> {
    const tx = getTransaction();

    // Get current task
    const task = await tx.query.tasksTable.findFirst({
      where: eq(tasksTable.id, id),
    });

    if (!task) {
      return undefined;
    }

    let newPosition: number;

    if (position === "first") {
      const [{ minPosition }] = await tx
        .select({ minPosition: min(tasksTable.position) })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.projectId, task.projectId),
            eq(tasksTable.column, column),
          )
        );
      newPosition = (minPosition ?? POSITION_GAP) - POSITION_GAP;
    } else {
      // Default to last
      const [{ maxPosition }] = await tx
        .select({ maxPosition: max(tasksTable.position) })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.projectId, task.projectId),
            eq(tasksTable.column, column),
          )
        );
      newPosition = (maxPosition ?? 0) + POSITION_GAP;
    }

    const [updatedTask] = await tx
      .update(tasksTable)
      .set({ column, position: newPosition })
      .where(eq(tasksTable.id, id))
      .returning();

    return updatedTask ? fromTaskEntity(updatedTask) : undefined;
  }
}
```

#### 3.3 Update Task Handlers
**File**: `/code/apps/server/src/tasks/tasks-handlers.ts`

Add handler for moveToColumn endpoint:

```typescript
moveToColumn: async (ctx) => {
  const { taskId } = ctx.hono.req.param();

  const movedTask = await withNewTransaction(ctx.services.db, () =>
    ctx.services.taskQueue.moveTaskToColumn(
      taskId as TaskId, 
      ctx.body.column,
      ctx.body.position
    ),
  );

  if (!movedTask) {
    return notFound();
  }

  return ok(movedTask);
},
```

### Phase 4: Work Queue Integration

#### 4.1 Update getNextTask to Use Ready Column
**File**: `/code/apps/server/src/task-queue/DatabaseTaskQueue.ts`

Update `getNextTask` to only pick from "ready" column:

```typescript
async getNextTask(projectId: ProjectId): Promise<Task | undefined> {
  return this.getNextReadyTask(projectId);
}
```

#### 4.2 Update BackgroundWorkflowProcessor
**File**: `/code/apps/server/src/workflow/BackgroundWorkflowProcessor.ts`

Update to move tasks between columns during processing:

```typescript
private async processRun(job: Job<RunQueueJobPayload>): Promise<void> {
  const runId = job.data.runId;
  const loggingContext = {
    projectId: job.data.projectId,
    runId,
    taskId: job.data.taskId,
    jobId: job.id,
  };

  // Move task to "in_progress" when picked up
  await withNewTransaction(this.db, async () => {
    await this.taskQueue.moveTaskToColumn(job.data.taskId, "in_progress");
  });

  const inProgressResult = await this.markRunAsInProgress(runId);
  // ... rest of processing

  if (result.success === false) {
    // Task failed - keep it in "in_progress" or move to a "failed" column
    // For now, leave in in_progress
    console.warn("A Run failed", { ...loggingContext, error: result.error.reason });
    await this.markRunAsFailed(runId);
  } else {
    // Task completed successfully - move to appropriate column
    const project = await withNewTransaction(this.db, async () => {
      return await this.projectsService.getProject(job.data.projectId);
    });

    if (project) {
      const targetColumn = project.workflowConfiguration.onTaskCompleted === "push-branch" 
        ? "in_review" 
        : "done";
      
      await withNewTransaction(this.db, async () => {
        await this.taskQueue.moveTaskToColumn(job.data.taskId, targetColumn);
      });
    }

    const completedResult = await this.markRunAsCompleted(runId);
    // ... rest
  }
}
```

#### 4.3 Update WorkflowExecutionService
**File**: `/code/apps/server/src/workflow/WorkflowExecutionService.ts`

Remove the `completeTask` call since column transition handles completion:

```typescript
// In executeWorkflow or processTask, remove or modify:
// const completedTask = await this.taskQueue.completeTask(task.id);
// This is now handled by column transitions
```

### Phase 5: Frontend Updates

#### 5.1 Update Task Type
**File**: `/code/apps/frontend/app/types/task.ts`

```typescript
export type TaskColumn = "backlog" | "ready" | "in_progress" | "in_review" | "done";

export type Task = {
  id: TaskId;
  title: string;
  description: string;
  completedOn: Date | null | undefined;
  column: TaskColumn;
};
```

#### 5.2 Create Board Component
**File**: `/code/apps/frontend/app/components/board/Board.tsx`

Create a new Kanban board component:

```typescript
interface BoardProps {
  project: Project;
  tasks: Task[];
  onMoveTask: (taskId: TaskId, column: TaskColumn, position?: "first" | "last") => void;
}

export function Board({ project, tasks, onMoveTask }: BoardProps) {
  const isReviewMode = project.workflowConfiguration.onTaskCompleted === "push-branch";
  
  const columns: TaskColumn[] = isReviewMode 
    ? ["backlog", "ready", "in_progress", "in_review", "done"]
    : ["backlog", "ready", "in_progress", "done"];

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    return columns.reduce((acc, column) => {
      acc[column] = tasks.filter(t => t.column === column);
      return acc;
    }, {} as Record<TaskColumn, Task[]>);
  }, [tasks, columns]);

  return (
    <div className="flex h-full gap-4 overflow-x-auto">
      {columns.map(column => (
        <BoardColumn 
          key={column}
          column={column}
          tasks={tasksByColumn[column]}
          onMoveTask={onMoveTask}
        />
      ))}
    </div>
  );
}
```

#### 5.3 Create BoardColumn Component
**File**: `/code/apps/frontend/app/components/board/BoardColumn.tsx`

```typescript
interface BoardColumnProps {
  column: TaskColumn;
  tasks: Task[];
  onMoveTask: (taskId: TaskId, column: TaskColumn, position?: "first" | "last") => void;
}

export function BoardColumn({ column, tasks, onMoveTask }: BoardColumnProps) {
  const columnTitles: Record<TaskColumn, string> = {
    backlog: "Backlog",
    ready: "Ready",
    in_progress: "In Progress",
    in_review: "In Review",
    done: "Done",
  };

  return (
    <div className="flex flex-col w-80 min-w-80 bg-muted/50 rounded-lg">
      <div className="p-3 font-semibold border-b">
        {columnTitles[column]} ({tasks.length})
      </div>
      <div className="flex-1 p-2 space-y-2">
        {/* Task cards with drag and drop */}
      </div>
    </div>
  );
}
```

#### 5.4 Update TaskQueue Component
**File**: `/code/apps/frontend/app/components/tasks/TaskQueue.tsx`

Replace or augment the current list view with the board view:

```typescript
// Replace the DndContext/SortableContext with Board component
<Board 
  project={project}
  tasks={tasks}
  onMoveTask={handleMoveTaskToColumn}
/>
```

#### 5.5 Add useMoveTaskToColumn Hook
**File**: `/code/apps/frontend/app/hooks/useTasks.ts`

```typescript
export function useMoveTaskToColumn(projectId: ProjectId) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      taskId, 
      column, 
      position 
    }: { 
      taskId: TaskId; 
      column: TaskColumn; 
      position?: "first" | "last";
    }) => {
      const response = await apiClient.post(
        `/projects/${projectId}/tasks/${taskId}/move-to-column`,
        { column, position }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });
}
```

### Phase 6: Data Migration

#### 6.1 Migration Script
Create a script to migrate existing tasks:

```typescript
// Migration: Set existing incomplete tasks to "ready" column
// Completed tasks go to "done" column
await db.update(tasksTable)
  .set({ column: "ready" })
  .where(isNull(tasksTable.completedOn));

await db.update(tasksTable)
  .set({ column: "done" })
  .where(isNotNull(tasksTable.completedOn));
```

### Phase 7: Testing & Validation

#### 7.1 Backend Tests
- Test `getNextReadyTask` only returns tasks from Ready column
- Test `moveTaskToColumn` updates column and position correctly
- Test task run lifecycle moves tasks through correct columns
- Test review mode vs non-review mode column transitions

#### 7.2 Frontend Tests
- Test Board component renders correct columns based on project mode
- Test drag and drop between columns
- Test task cards display in correct columns

#### 7.3 Integration Tests
- Test end-to-end workflow:
  1. Create task → goes to Backlog
  2. Move to Ready
  3. Start run → moves to In Progress
  4. Complete run → moves to In Review (review mode) or Done (non-review)
  5. Complete task → stays in Done

## Files to Modify

### Database
- `/code/apps/server/src/db/schema.ts` - Add column enum and field

### API
- `/code/packages/api/src/tasks/tasks-api.ts` - Add column to DTO and new endpoints
- `/code/packages/api/src/tasks/tasks-model.ts` - Export TaskColumn type

### Backend Services
- `/code/apps/server/src/task-queue/TaskQueue.ts` - Update interface
- `/code/apps/server/src/task-queue/DatabaseTaskQueue.ts` - Implement new methods
- `/code/apps/server/src/tasks/tasks-handlers.ts` - Add moveToColumn handler
- `/code/apps/server/src/workflow/BackgroundWorkflowProcessor.ts` - Update column transitions
- `/code/apps/server/src/workflow/WorkflowExecutionService.ts` - Remove completeTask call

### Frontend
- `/code/apps/frontend/app/types/task.ts` - Add TaskColumn type
- `/code/apps/frontend/app/components/board/Board.tsx` - New component
- `/code/apps/frontend/app/components/board/BoardColumn.tsx` - New component
- `/code/apps/frontend/app/components/tasks/TaskQueue.tsx` - Integrate board
- `/code/apps/frontend/app/hooks/useTasks.ts` - Add moveToColumn hook

## Open Questions

1. **Default Column for New Tasks**: Should new tasks go to "Backlog" or "Ready"?
   - Recommendation: Start in "Backlog", user manually moves to "Ready"

2. **Manual Column Transitions**: Should users be able to manually move tasks between any columns?
   - Recommendation: Allow manual moves except:
     - Can't manually move to "In Progress" (only via work queue)
     - Can't manually move out of "Done"

3. **Failed Tasks**: Should failed tasks stay in "In Progress" or move to a separate column?
   - Recommendation: Stay in "In Progress" with a failed indicator

4. **Position Management**: Should each column have its own position sequence?
   - Recommendation: Yes, positions are scoped to each column

## Implementation Order

1. Database schema changes (Phase 1)
2. API layer updates (Phase 2)
3. Backend service implementation (Phase 3)
4. Data migration (Phase 6)
5. Work queue integration (Phase 4)
6. Frontend implementation (Phase 5)
7. Testing and validation (Phase 7)

## Estimated Effort

- **Database & API**: 2-3 hours
- **Backend Services**: 4-6 hours
- **Frontend Components**: 6-8 hours
- **Testing & Bug Fixes**: 4-6 hours
- **Total**: 16-23 hours
