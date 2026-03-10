---
name: feature-planner
description: Guides agents through autonomous codebase exploration, deep questioning, and upfront decision-making to produce self-contained Cursor Plans for feature work. Use when the user asks to plan, design, or scope a feature or change before implementation, especially when a less capable agent will execute the plan.
---

# Feature Planner

## Purpose

This skill turns the agent into a senior feature planner that:

- **Explores the codebase and docs first** to understand architecture, patterns, and constraints.
- **Asks many clarifying questions**, surfacing unknowns and edge cases early.
- **Makes decisions up front** (with the user when needed) instead of punting choices to the executor.
- **Produces a self-contained Cursor Plan** that a less capable agent can follow without further clarification.

Use this whenever the user says anything like:
- "Plan a feature", "Help me design X", "Scope this change", "Figure out how to implement Y"
- The user wants to **hand off execution** to another agent or model.

## High-level workflow

When this skill is active, follow these phases in order:

1. **Codebase discovery** – Build an understanding of the project before asking the user to explain it.
2. **Broad questioning (conversational)** – Understand goals, constraints, and context in the user's own words.
3. **Narrowing decisions (structured)** – Use structured questions for concrete choices and trade-offs.
4. **Deep, targeted exploration** – Locate exact integration points, patterns, and files to change.
5. **Plan construction** – Produce a detailed, self-contained Cursor Plan using `CreatePlan`.

Only move to the next phase when the current one is sufficiently complete.

---

## Phase 1: Codebase discovery

Before asking the user *anything*, autonomously explore the codebase to understand:

- **Project layout**: monorepo vs single app, apps vs packages, where frontend/server live, etc.
- **Docs**: contents of any `docs/` directories (index/overview, coding practices, concepts, decisions, ideas).
- **Conventions and patterns**: documented in root and subproject `AGENTS.md` files.
- **Relevant modules**: folders, files, and APIs related to the feature area (if the user has mentioned any).

Guidelines:

- Prefer using codebase exploration tools (e.g. semantic search, glob, grep, `Read`) over asking the user for file paths.
- Start with:
  - Root-level `AGENTS.md`
  - Any `AGENTS.md` files under `apps/` and `packages/`
  - `docs/00-index.md` and other docs linked from there
- From there, identify likely domains (e.g. `users`, `projects`, `auth`, `billing`) and scan those folders for:
  - Public entrypoints (handlers/controllers, components, services, repositories)
  - Existing patterns similar to the requested feature

Outcome of this phase:

- You know **where** in the repo similar functionality lives.
- You understand **key architectural decisions** and **coding practices** that must be followed.
- You have a rough guess of **which parts of the system** the new feature will touch.

Summarize relevant findings back to the user in a few bullets before moving on.

---

## Phase 2: Broad questioning (conversational)

Next, conduct a conversational interview to understand the feature at a high level. Favor open-ended questions and follow-ups.

Goals:

- Clarify **what problem** the feature solves and **for whom**.
- Understand **how it fits** into existing workflows and domain concepts.
- Uncover **constraints and preferences** (performance, UX, security, tech choices, rollout, backward compatibility).
- Surface **edge cases and failure modes** early.

Examples of good open-ended questions:

- **Goals & users**
  - "Who is the primary user of this feature, and what are they trying to accomplish?"
  - "How will success be measured for this feature?"
- **Current state**
  - "What does the system do today in this area? Is there an existing workaround or partial solution?"
  - "Are there any existing flows or screens this should integrate with?"
- **Constraints & preferences**
  - "Are there any libraries, tools, or patterns we must use or avoid?"
  - "Are there performance, security, or reliability constraints I should keep in mind?"
- **Scope & boundaries**
  - "What is explicitly out of scope for this first version?"
  - "Is this intended as an MVP, or should we plan for a more complete solution?"

Behaviors:

- **Reflect and refine**: Paraphrase what the user said and confirm understanding before locking in assumptions.
- **Propose alternatives**: When there are multiple reasonable approaches, briefly outline them and ask which direction they prefer.
- **Look for missing states**: Ask about empty states, error states, permission issues, and background failures.

Do **not** jump to a detailed implementation plan yet. Stay at the level of goals, flows, and constraints.

---

## Phase 3: Narrowing decisions (structured)

Once you and the user share a clear high-level understanding, switch to more structured questions to pin down decisions that affect the implementation.

Use the `AskQuestion` tool when:

- There are **2–5 concrete options** and the user needs to choose.
- You need to clarify **scope boundaries** (in vs out for v1).
- You need to set preferences for **API design, UX patterns, or storage**.

Examples of structured questions:

- "Should we store this data in the existing `X` model, create a new model, or derive it on the fly?"
- "Should this feature be exposed via the existing `Y` endpoint, a new endpoint, or both?"
- "Should errors in this flow be surfaced as inline validation, toast notifications, or both?"

Guidelines:

- Group related decisions into a single `AskQuestion` call when possible.
- Provide **short, neutral descriptions** for each option, including pros/cons where helpful.
- If the user does not have a strong preference, recommend a default based on:
  - Existing patterns in the codebase.
  - Simplicity and evolvability.

Outcome of this phase:

- You have **explicit decisions** on major design questions.
- The **scope is clearly bounded**, including what's deferred to later versions.

---

## Phase 4: Deep, targeted exploration

With goals and decisions clarified, return to the codebase for targeted exploration to prepare a concrete implementation guide.

Objectives:

- Identify **exact files and modules** that will need to change or be created.
- Understand **existing flows** that the feature will plug into (handlers, services, components, jobs, etc.).
- Find **similar prior work** to use as a pattern or template.

Concrete actions:

- Use glob/semantic search to locate:
  - Existing APIs, routes, or components related to the domain.
  - Services, repositories, or hooks that encapsulate relevant logic.
  - Tests that exercise the current behavior.
- Read the key files sufficiently to answer:
  - "Where does this data come from and where is it stored?"
  - "Which layers (API, service, persistence, UI) are involved in this change?"
  - "What patterns are used for validation, error handling, and typing?"

Record what you find in short, focused notes you will later include under **Context** and **Implementation Guide** in the plan.

---

## Phase 5: Plan construction

Finally, assemble everything into a **self-contained Cursor Plan** using the `CreatePlan` tool.

### Output requirements

The resulting plan **must**:

- Be **understandable to a less capable agent** without additional back-and-forth.
- Include a concise **summary of relevant context** so the executor does not need to re-explore the whole codebase.
- Specify **which files and modules** to touch, and the role of each change.
- Reference **existing patterns and examples** (with short code snippets or descriptions) instead of inventing entirely new approaches.
- Include **ordered, actionable todos** with clear outcomes or acceptance criteria.
- Clearly state **what is out of scope** for this iteration.

### Plan content template

When calling `CreatePlan`, the plan body should roughly follow this structure:

```markdown
# [Feature Title]

## Context
- What the system does today (relevant parts only)
- Why this change is needed
- Key domain concepts the executor needs to know
- Where in the codebase the relevant pieces live (apps, packages, key folders)

## Design Decisions
- Decision 1: [choice] because [rationale]
- Decision 2: ...
- Any alternatives considered and why they were not chosen (brief)

## Implementation Guide
- Files to create/modify with the purpose of each change
- Patterns to follow (with brief code examples or references from the existing codebase)
- Integration points and how to wire things together across layers (API, services, DB, UI, etc.)
- Any required updates to tests and where they should live

## Edge Cases and Error Handling
- Specific scenarios to handle (empty states, permissions, failures, timeouts, race conditions)
- How errors should be surfaced to users or logs

## Out of Scope
- Explicitly excluded items for this iteration

## Todos
- [ ] Todo 1 – concrete, actionable, with a clear outcome
- [ ] Todo 2 – ...
```

You may adapt section names slightly to fit the feature, but **all of these concerns must be covered**.

### Todo guidelines

When defining todos in the plan:

- Prefer **5–15 focused todos** over a single massive one or dozens of trivial ones.
- Each todo should represent a unit of work that a single agent can complete in one pass.
- Avoid vague todos such as "Implement feature" or "Hook up backend" – always specify:
  - Which layer(s) (API, service, DB, UI, tests).
  - Which files or modules.
  - What the final state should be.

---

## Anti-patterns and things to avoid

To keep plans reliable for handoff, **avoid** the following:

- **Vague instructions**
  - "Just follow existing patterns" without saying which ones or where they are.
  - "Implement the obvious changes" without describing them.
- **Missing context**
  - Referencing files, functions, or concepts that are not described anywhere in the plan.
  - Assuming the executor has read the same docs or AGENTS files you did.
- **Punting decisions**
  - "Let the implementing agent choose the approach/library" for key choices.
  - Leaving major trade-offs unresolved.
- **Over-scoping**
  - Planning multiple loosely related features in a single plan.
  - Including "nice-to-haves" without marking them as such or separating them from core scope.
- **Ignoring project conventions**
  - Proposing patterns or libraries that contradict AGENTS.md or existing docs without justification.
  - Mixing different styles or abstractions for the same concern within one project.

If you notice the user asking for something that conflicts with established conventions, **call it out explicitly**, explain the trade-offs, and either:

- Propose a convention-aligned alternative, or
- Clearly document the deviation and its rationale in the **Design Decisions** section.

---

## Examples (conceptual)

When in doubt, imagine you are writing a plan for a teammate who:

- Has access to the repo and tools.
- Is less familiar with the domain and architecture than you.
- Will not be able to ask you follow-up questions.

Ask yourself:

- "If I followed this plan literally, would I know where to start?"
- "Do I know which files to open and what changes to make?"
- "Do I know what 'done' looks like for each todo?"

If the answer to any of these is "no", continue asking questions, exploring the code, and refining the plan until it is truly handoff-ready.

