---
name: plan-executor
description: >
  Orchestrates execution of Cursor Plans with multiple TODOs by spawning one todo-completer subagent per TODO in serial order, managing plan state, git commits, and human escalation.
  TRIGGER WHEN: User asks to execute a plan that has more than 3 TODOs in it
---

# Plan Executor

Orchestrate execution of plans from `.cursor/plans/*.plan.md` by delegating each TODO to a todo-completer subagent, maintaining plan state, and handling git commits between completed todos.

## When to Apply

Apply this skill when the user asks to execute a plan and that plan has **more than 3 TODOs**. For plans with a few TODOs, execute directly without orchestration.

## Pre-flight

Before starting plan execution:

1. **Branch check**: Run `git branch --show-current`. If on `main` or `master`, you **must not push** there. Checkout a new branch (e.g. `git checkout -b plan-<plan-name-slug>`).
2. **Human preferences**: Ask if the human wants to override the default process (e.g. different commit cadence, no pushing until the end). If not, follow the default flow below.
3. **Plan selection**: Confirm the plan file path. Plans live in `.cursor/plans/*.plan.md`. The plan frontmatter contains `todos` as an ordered list of `{ id, content, status }` where `status` is `pending`, `in-progress`, or `completed`.

## Execution Loop

Execute TODOs **strictly in order**. One subagent per TODO. No batching or parallelisation.

For each pending TODO:

### 1. Update plan state

Set the TODO's `status` to `in-progress` in the plan file's frontmatter.

### 2. Spawn subagent

**You must spawn the "Plan TODO executor" subagent** (defined at `.cursor/agents/todo-completer.md`). Use whatever invocation mechanism your harness provides, but ensure you target this specific subagent – do not use a generic agent type.

Include in the task:
- **Plan file path** (so it can read the whole plan for context)
- **Which TODO** to work on (give it the `id` and the TODO `content`)
- **Optional extra context**: If the subagent needs specifics from work a previous subagent completed that are not in the plan, pass them.

#### Cursor mcp_task tool

When using Cursor's Task tool (`mcp_task`):

| Parameter | Required | Value |
|-----------|----------|-------|
| `subagent_type` | Yes | `"Plan TODO executor"` – matches the `name` in the todo-completer frontmatter |
| `description` | Yes | Short 3–5 word description of the task (e.g. "Complete driver-app todo") |
| `prompt` | Yes | Full instructions: plan file path, TODO id, TODO content, and any extra context |

Optional: `model` (e.g. `"fast"`), `readonly`, `run_in_background`, `resume` (agent ID), `attachments` (file paths).

Example prompt structure:

```
Execute the following TODO from the plan.

Plan file: .cursor/plans/driver_binary_execution_c4f8a2b1.plan.md
TODO id: driver-app
TODO content: Create a new workspace app at apps/driver. Add its package.json...

[Optional: Context from previous subagent work that isn't in the plan]
```

### 3. Handle subagent result

**Success**
- Set the TODO's `status` to `completed` in the plan file
- Add all modified files (don't trust the subagent's report, commit everything they modify)
- Commit with an explanatory message (summarise the TODO completed)
- Push the commit
- If the subagent reported "Additional work to be organised", incorporate that into the plan (new TODOs or notes) before moving to the next one

**Failure (task completion)**
- If the issue is simple and you can fix it (e.g. update the plan, clarify the TODO): do so, then spawn a new subagent for the same TODO
- If the problem requires a decision or is ambiguous: **stop and ask for human input**. Do not guess.

**Failure (infrastructure)**
- Cursor errors, subagent failed to start, etc.: Retry up to **3 times** for the same TODO before escalating to the human.

### 4. Context and continuation

- **Context window**: When approaching ~70% context usage, stop and ask the human whether to continue or pause. Do not silently truncate.
- **Subagents struggling**: If multiple subagents are failing or the plan keeps needing fixes, ask for human input.
- **Plan changes**: If the plan needs material modification (scope change, new dependencies, reordering), ask for human input.
- **Early stop**: You may decide to stop before finishing all TODOs if context is running low or subagents are repeatedly failing. Inform the human and explain.

## Rules

| Rule | Why |
|------|-----|
| No parallel subagents | Serial execution only |
| Never push to main/master | Must work on a feature branch |
| Parent owns plan file state | Subagent does not update todo status |
| Parent owns git commits | Add, commit, push after each successful TODO |
| No code quality checks between TODOs | Codebase may be intentionally broken mid-plan, sub-agents are responsible for this check |
| Subagent owns code quality at end of its run | Verification is the subagent's job |

## Exception: Subagent confusion

If a subagent reports that it expected the codebase to be "working" (e.g. typecheck passes, tests pass) but it is not, and that blocks progress: **ask for human input**. Do not spawn another subagent hoping it will fix the intermediate state.

## Plan file format

Plans use YAML frontmatter:

```yaml
---
name: Plan Name
overview: Brief description
todos:
  - id: todo-1
    content: Description of work
    status: pending   # pending | in-progress | completed
  - id: todo-2
    content: ...
    status: pending
isProject: false
---
```

When updating status, preserve the rest of the frontmatter and only change the relevant TODO's `status` field.
