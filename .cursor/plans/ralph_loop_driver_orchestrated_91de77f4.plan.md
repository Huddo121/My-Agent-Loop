---
name: Ralph Loop on Driver
overview: Build Ralph Loop on top of the new in-sandbox driver so tasks with subtasks can be progressed across multiple harness invocations within the same sandbox, with task-file-driven progress, per-iteration syncs, retries, and final workflow completion after all runnable subtasks are done.
todos:
  - id: task-format
    content: Extend the driver so that it can read plan files and determine if there are TODOs in the frontmatter, and act accordingly.
    status: pending
  - id: driver-loop
    content: Extend the driver runtime so when the task file contains subtasks it keeps iterating until there are no runnable subtasks left, a retry limit is reached, or the harness crashes. The same loop should still support plain tasks by completing after one successful iteration.
    status: pending
  - id: progress-rules
    content: Implement Ralph Loop progress detection in the driver. Treat any forward subtask state movement as valid progress, including `pending -> in-progress`, `in-progress -> completed`, and transitions to `cancelled` when appropriate. Remove any requirement that exactly one subtask be completed in a single iteration.
    status: pending
  - id: prompt-updates
    content: Update the harness prompt variant used by the driver for Ralph Loop runs so it tells the harness to read the task file, work on the next available TODO, update the task file as work progresses, and stop after making meaningful progress. Keep the wording generic enough to work across the supported harnesses.
    status: pending
  - id: retry-reset
    content: Add Ralph Loop retry behavior to the driver. If an iteration exits unsuccessfully or makes no forward progress, reset the repo to the last committed state for the run and retry up to 3 total attempts for the current stalled state in the same sandbox. Persist the task snapshot after each iteration, including failed ones.
    status: pending
  - id: commit-strategy
    content: Implement per-iteration git checkpoints in the driver. After each iteration that made progress worth keeping, stage and commit the repo state with a message summarizing the subtask progress recorded in that iteration. These commits form the final branch history for the existing workflow completion step.
    status: pending
  - id: workflow-finish
    content: Refactor `apps/server/src/workflow/WorkflowExecutionService.ts` so run success now means the driver exited successfully. After a successful driver run, invoke the existing `workflow.onTaskCompleted` action once for the parent task repository state, then mark the parent task as completed. If the driver fails, do not complete the parent task.
    status: pending
  - id: persistence
    content: Ensure the server-side task record is updated from the driver snapshot after each iteration. Future reruns should resume from the latest persisted subtask states instead of reconstructing state from git history or logs.
    status: pending
  - id: tests
    content: Add tests for Ralph Loop behavior. Cover multi-iteration success, forward-progress detection, no-progress retries, resume behavior from persisted subtask states, tasks with only completed/cancelled subtasks, and terminal failure after 3 attempts.
    status: pending
  - id: docs
    content: Document Ralph Loop in `docs/decisions/` or another appropriate doc. Explain that all runs are now driver-based, that tasks with subtasks are progressed via repeated harness invocations in one sandbox, that the task file is the in-sandbox source of truth, and that progress is synced back to the host after each iteration. Update `docs/00-index.md` if needed.
    status: pending
isProject: false
---

# Ralph Loop on Driver

## Context

This plan assumes the driver work is already complete. Every sandbox run is already controlled by a dedicated in-sandbox driver binary, the driver already persists task snapshots through a token-authenticated non-MCP host API, and the driver-owned local task file already exists inside the sandbox. Ralph Loop builds on that foundation to support tasks with subtasks by letting the driver invoke the harness repeatedly inside the same sandbox while maintaining one working task file and one repository checkout.

The user wants Ralph Loop to rely on the task file inside the sandbox as the working source of truth, not on host-side bind-mounted rewrites or MCP-driven subtask updates. The host should still receive synced snapshots after each iteration so UI state and future reruns remain accurate.

## Design Decisions

### Driver first

Ralph Loop depends on the driver being present. The server should not own a separate repeated-exec orchestration path.

### Task-file-driven progress

Inside the sandbox, the task file is authoritative during the run. The harness is prompted to read that file, complete the next available TODO, and update the file as it works. Do not use MCP subtask tools for Ralph Loop state persistence.

### Progress is broad

Ralph Loop accepts any forward movement in subtask state. It does not require exactly one completed subtask per iteration.

### Final workflow remains centralized

Per-iteration commits are created by the driver, but branch pushing, MR creation, or merge behavior still happens once at the end through the existing workflow completion callback.

## Implementation Guide

### 1. Task file shape

The subtask file already follows the shape from Cursor. No changes are needed to the format of the file, but the driver will need to be able to read the frontmatter to determine TODO state and track their changes over time.

### 2. Driver Ralph Loop

Extend the driver loop to:

1. Load current task state from the local task file.
2. Determine whether runnable subtasks remain.
3. Invoke the harness with the Ralph Loop prompt.
4. Re-read the task file.
5. Compare pre/post states for forward progress.
6. Sync the updated snapshot to the host.
7. Commit or reset/retry.

The loop ends when all runnable subtasks are done or retries are exhausted.

The harness should be treated as a task-file editor that makes progress on the next available TODO. The driver remains responsible for detecting progress and syncing the resulting task snapshot back to the host.

### 3. Retry and reset

If the harness crashes or no forward progress is detected:

- reset repo state to the last successful commit for this run
- keep the latest synced task snapshot semantics consistent with the chosen failure handling
- retry up to 3 times for the current stalled state

After the third failure, the driver exits non-zero and the run is marked failed.

### 4. Workflow execution changes

`WorkflowExecutionService` should treat the driver as the runtime executor. After the driver succeeds:

1. reload the final task state if needed
2. invoke `workflow.onTaskCompleted(...)`
3. mark the parent task completed

If the driver fails, leave the parent task incomplete.

### 5. Tests

Add tests for:

- successful multi-iteration subtask completion
- progress via `pending -> in-progress`
- progress via `in-progress -> completed`
- no-progress retry behavior
- resume from persisted subtasks on a later run
- tasks with no runnable subtasks left
- final workflow completion after driver success

## Out of Scope

- Running subtasks in parallel or across multiple sandboxes
- A new user-facing Ralph Loop setting in the frontend
- Replacing the existing workflow completion actions
- Rich subtask analytics or per-subtask timing dashboards

