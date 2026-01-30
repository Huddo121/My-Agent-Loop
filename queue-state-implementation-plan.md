# Queue State Management Implementation Plan

## Research Summary

### Current Implementation Analysis

The project currently uses BullMQ for background task processing with the following architecture:

1. **BackgroundWorkflowProcessor** (`apps/server/src/workflow/BackgroundWorkflowProcessor.ts`)
   - Creates a BullMQ Worker with concurrency of 5
   - Processes jobs from the `run-queue`
   - Handles job lifecycle: pending → in_progress → completed/failed
   - Supports "loop" mode for continuous task processing

2. **Queue Flow**
   - Frontend buttons trigger `POST /projects/:projectId/run` endpoint
   - Handler calls `queueNextTask()` which creates a run in DB and adds job to BullMQ
   - Worker picks up jobs and executes workflows in sandboxes
   - Loop mode automatically queues the next task after successful completion

3. **Existing Protections**
   - Task completion check prevents double-processing completed tasks
   - Run state transitions are validated (can't move from completed/failed to other states)
   - Each run gets a unique job ID (`run-${run.id}`)

### Identified Problems

1. **No duplicate prevention at queue level**: Users can click the start button multiple times, creating multiple runs for the same task
2. **Task selection happens at queue time**: The next task is selected when the job is added to the queue, not when it's processed
3. **No way to stop loop mode**: Once started, loop mode continues until all tasks are completed or an error occurs
4. **No force-stop capability**: No mechanism to kill running sandboxes and halt queue processing

## Proposed Solution

### 1. Prevent Duplicate Queue Starts

**Approach**: Use BullMQ's built-in deduplication feature with project-scoped deduplication IDs.

**Implementation**:
- Add deduplication metadata when adding jobs to the queue
- Use a deduplication ID based on `projectId` and `mode` (e.g., `project-${projectId}-${mode}`)
- Set appropriate TTL (e.g., 24 hours) to prevent indefinite deduplication

**Code Changes**:
```typescript
// In BackgroundWorkflowProcessor.queueNextTask()
const newJob = await this.workflowQueues.runQueue.add(
  `run-${run.id}`,
  {
    projectId,
    taskId: task.id,
    runId: run.id,
    mode,
  },
  {
    deduplication: {
      id: `project-${projectId}-${mode}`,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    },
  }
);
```

**Alternative**: If deduplication doesn't fit the use case (e.g., need to allow re-queueing after completion), implement a "processing lock" in the database:
- Add `isProcessing` boolean to projects table
- Set to `true` when starting, `false` when completed/stopped
- Check this flag before allowing new queue starts

### 2. Delay Task Selection Until Processing

**Approach**: Separate "queue start" from "task selection" by using a two-phase approach.

**Current Flow**:
1. User clicks start → select next task → create run → add job to queue
2. Worker picks up job → process task

**Proposed Flow**:
1. User clicks start → add "start-processing" job to queue
2. Worker picks up job → select next task → create run → process task
3. If loop mode and successful, worker adds another "start-processing" job

**Implementation**:
- Modify `queueNextTask` to accept an optional `taskId` parameter
- If no taskId provided, worker selects the next pending task at processing time
- This ensures the most up-to-date task queue state is used

**Database Changes**:
- None required, but we need to handle the case where no tasks are available

### 3. Stop Loop Mode Processing

**Approach**: Implement a "stop flag" that the worker checks before queuing the next task.

**Implementation**:
- Add `shouldStopLoop` flag to the project or a new `queue_state` table
- Worker checks this flag after completing a task in loop mode
- If flag is set, don't queue the next task
- Provide API endpoint to set this flag

**Code Changes**:
```typescript
// New table: queue_state
export const queueStateTable = pg.pgTable("queue_state", {
  projectId: pg.uuid().references(() => projectsTable.id).notNull().primaryKey(),
  isRunning: pg.boolean().notNull().default(false),
  shouldStop: pg.boolean().notNull().default(false),
  mode: pg.text(), // 'single' | 'loop' | null
  startedAt: pg.timestamp(),
  stoppedAt: pg.timestamp(),
});

// In BackgroundWorkflowProcessor.processRun()
if (mode === "loop" && result.success) {
  const shouldStop = await this.queueStateService.shouldStop(projectId);
  if (!shouldStop) {
    await this.queueNextTask(projectId, mode);
  } else {
    await this.queueStateService.markStopped(projectId);
  }
}
```

### 4. Force-Stop Queue and Kill Sandboxes

**Approach**: Use BullMQ's job cancellation with AbortSignal and implement sandbox termination.

**Implementation**:

**A. Job Cancellation**:
- Pass AbortSignal to worker processor
- Store active job signals in a Map
- On force-stop, abort all active signals
- BullMQ will mark jobs as failed

**Code Changes**:
```typescript
// In BackgroundWorkflowProcessor constructor
this.activeJobs = new Map<RunId, AbortController>();

// In processRun method
const controller = new AbortController();
this.activeJobs.set(runId, controller);

try {
  // Pass signal to workflow execution
  await this.workflowExecutionService.execute(job.data, controller.signal);
} finally {
  this.activeJobs.delete(runId);
}

// Force stop method
async forceStop(projectId: ProjectId): Promise<void> {
  // Abort all active jobs for this project
  for (const [runId, controller] of this.activeJobs.entries()) {
    const jobData = await this.getJobData(runId);
    if (jobData.projectId === projectId) {
      controller.abort();
    }
  }
  
  // Mark queue as stopped
  await this.queueStateService.markStopped(projectId);
  
  // Kill active sandboxes
  await this.sandboxService.killAllForProject(projectId);
}
```

**B. Sandbox Termination**:
- Track active sandboxes by runId
- Implement `killAllForProject` in SandboxService
- Use Docker/Podman kill command or process termination

## Implementation Phases

### Phase 1: Queue State Management (Foundation)

1. **Create QueueStateService**
   - Create database table for queue state
   - Implement CRUD operations
   - Add methods: `startProcessing`, `stopProcessing`, `shouldStop`, `isRunning`

2. **Update BackgroundWorkflowProcessor**
   - Inject QueueStateService
   - Update `queueNextTask` to use queue state
   - Update `processRun` to check shouldStop flag in loop mode

3. **Add API Endpoints**
   - `POST /projects/:projectId/queue/stop` - Stop loop processing
   - `GET /projects/:projectId/queue/status` - Get queue state

4. **Update Frontend**
   - Show queue state in TaskQueue component
   - Add stop button when queue is running in loop mode

### Phase 2: Duplicate Prevention

1. **Implement Deduplication**
   - Add deduplication options to job addition
   - OR implement database-based processing lock
   - Update `queueNextTask` to check for existing jobs

2. **Update Frontend**
   - Disable start buttons when queue is already running
   - Show appropriate loading states

### Phase 3: Force Stop and Sandbox Kill

1. **Implement Job Cancellation**
   - Add AbortController tracking to BackgroundWorkflowProcessor
   - Pass AbortSignal to workflow execution
   - Implement `forceStop` method

2. **Implement Sandbox Kill**
   - Add sandbox tracking by runId
   - Implement `killAllForProject` in SandboxService

3. **Add API Endpoint**
   - `POST /projects/:projectId/queue/force-stop` - Force stop and kill sandboxes

4. **Update Frontend**
   - Add force-stop button (dangerous action, require confirmation)

### Phase 4: Delayed Task Selection

1. **Refactor Task Selection**
   - Modify `queueNextTask` to support optional taskId
   - Move task selection logic from API handler to worker
   - Ensure atomic task selection (prevent race conditions)

2. **Update Queue Flow**
   - Initial job only contains projectId and mode
   - Worker selects task at processing time
   - Handle case where no tasks are available

## Technical Considerations

### Race Conditions

- **Task Selection**: Use database row locking or atomic operations to prevent multiple workers from selecting the same task
- **Queue State Updates**: Use optimistic locking or transactions to prevent state corruption

### Error Handling

- **Partial Failures**: If force-stop fails to kill some sandboxes, report which ones are still running
- **Recovery**: If server restarts, restore queue state from database and clean up stale jobs

### Monitoring

- Add queue state to project status endpoint
- Log all queue state transitions
- Track metrics: queue start time, processing duration, stop reasons

### Database Schema

```typescript
// queue_state table
export const queueStateTable = pg.pgTable("queue_state", {
  projectId: pg.uuid().references(() => projectsTable.id).notNull().primaryKey(),
  isRunning: pg.boolean().notNull().default(false),
  shouldStop: pg.boolean().notNull().default(false),
  mode: pg.text(), // 'single' | 'loop' | null
  currentRunId: pg.uuid().references(() => runsTable.id),
  startedAt: pg.timestamp(),
  stoppedAt: pg.timestamp(),
  lastError: pg.text(),
});
```

## API Changes

### New Endpoints

```typescript
// Stop queue processing (graceful)
POST /projects/:projectId/queue/stop
Response: { success: true }

// Force stop (kill sandboxes)
POST /projects/:projectId/queue/force-stop
Response: { success: true, killedRuns: RunId[] }

// Get queue status
GET /projects/:projectId/queue/status
Response: {
  isRunning: boolean;
  mode: 'single' | 'loop' | null;
  currentRunId: RunId | null;
  startedAt: string | null;
}
```

### Modified Endpoints

```typescript
// Existing start run endpoint - add deduplication check
POST /projects/:projectId/run
Error Response (new): {
  error: 'queue-already-running',
  message: 'Queue is already processing tasks for this project'
}
```

## Frontend Changes

### TaskQueue Component Updates

1. **Queue Status Display**
   - Show "Processing..." indicator when queue is running
   - Display current mode (single/loop)
   - Show elapsed time since queue started

2. **Button States**
   - Disable play/loop buttons when queue is running
   - Show stop button when running in loop mode
   - Show force-stop button (with confirmation dialog)

3. **Real-time Updates**
   - Poll queue status endpoint every 5 seconds
   - Or use WebSocket/SSE for real-time updates (future enhancement)

## Testing Strategy

1. **Unit Tests**
   - QueueStateService state transitions
   - Deduplication logic
   - AbortController handling

2. **Integration Tests**
   - Full queue start → process → stop flow
   - Force stop during active processing
   - Loop mode with multiple tasks

3. **E2E Tests**
   - Frontend button interactions
   - Queue status display updates
   - Error scenarios (network failures, etc.)

## Future Enhancements

1. **WebSocket/SSE**: Real-time queue status updates instead of polling
2. **Queue Metrics**: Track and display processing statistics
3. **Retry Logic**: Allow users to retry failed tasks from the UI
4. **Batch Operations**: Start/stop multiple projects at once
5. **Queue Priorities**: Support priority queues for urgent tasks

## References

- [BullMQ Deduplication](https://docs.bullmq.io/guide/jobs/deduplication)
- [BullMQ Cancelling Jobs](https://docs.bullmq.io/guide/workers/cancelling-jobs)
- [BullMQ Pause/Resume](https://docs.bullmq.io/guide/workers/pausing-queues)
- [BullMQ Sandboxed Processors](https://docs.bullmq.io/guide/workers/sandboxed-processors)
