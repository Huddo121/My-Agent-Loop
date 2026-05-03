---
name: code-review
description: Reviews code changes in this repository for correctness, edge cases, and alignment with local patterns. Use when the user asks for a code review of diffs, pull requests, or modified files in this project.
---

# Code Review

## Purpose

This skill guides the agent to perform **project-scoped, correctness-first code reviews** for this repository.

Reviews using this skill should:

- Focus primarily on **correctness, bugs, and edge cases**.
- Provide feedback **grouped by file**, with clear references (file names and brief location hints).
- Mention refactors when they are **high-impact simplifications**, not minor stylistic preferences.
- Be **lightly informed by local conventions** (from `docs/` and `AGENTS.md`) without overwhelming the review.
- Produce feedback that a human can quickly scan and weigh; no severity labels are required.

Use this skill when the user asks you to:

- "Review this diff/PR", "Look over these changes", "Do a code review", or similar.
- Sanity-check correctness and surface hidden edge cases before merging.

---

## Inputs and assumptions

When starting a review, the agent should clarify or infer:

- **Scope**:
  - If the user provided a diff or PR, assume the **diff/PR is the primary scope**.
  - If the user specified files, review **those files**.
  - If ambiguous, briefly ask the user whether to:
    - Focus on just the staged/PR diff, or
    - Include closely related files (e.g. obvious collaborators and tests).
- **Context**:
  - Which part of the system the change affects (e.g. frontend, server, API, domain area).
  - Any specific concerns the user has (e.g. performance, security, readability).

If in doubt, **ask concise clarifying questions** before proceeding.

---

## Preparation: understand local conventions (lightly)

Before (or while) reviewing, quickly familiarize yourself with this repository’s practices:

- Skim root `AGENTS.md` for general guidance.
- Skim key docs like:
  - `docs/02-coding-practices.md` (coding practices and patterns),
  - Any domain-specific docs that are clearly relevant to the changed code.

Apply this knowledge **lightly**:

- Call out **clear deviations** from established patterns (e.g. inconsistent error handling, ignoring existing abstractions).
- Prefer **consistency with nearby code** when multiple approaches are reasonable.
- Do not turn the review into a style-only critique; keep the focus on correctness and meaningful improvements.

---

## Review workflow

Always structure your review in **two passes**:

1. **High-level pass** – Understand intent and overall approach.
2. **Detailed per-file pass** – Walk each changed file and comment on correctness, edge cases, and impactful improvements.

### 1. High-level pass

In the high-level pass, answer for yourself:

- What is the change trying to accomplish?
- Does the approach make sense given the surrounding architecture and patterns?
- Are there obvious missing pieces (e.g. tests, handling of a major edge case, data validation)?

Summarize this in a short **Overall** section at the start of the review:

- One or two sentences on the feature/change.
- One or two sentences on the overall impression (sound approach, concerns, etc.).

### 2. Detailed per-file pass

Then, review changes **file by file**.

For each file:

1. Identify what role the file plays (e.g. React component, API handler, service, repository, test).
2. Scan for **correctness issues and edge cases**:
   - Mis-handled null/undefined or optional values.
   - Incorrect assumptions about data shape or types.
   - Error cases not handled or surfaced properly.
   - Concurrency, race conditions, or ordering issues.
   - Incorrect or missing updates to related code (e.g. tests, types, DTOs).
3. Consider **high-impact simplifications**:
   - Duplicate logic that could be extracted.
   - Overly complex branching where pattern matching or small helper functions would improve clarity.
   - Dead code or unused parameters.

For each noteworthy finding, write a **concise comment** under that file’s section.

---

## Output format

The review response should be structured like this:

```markdown
## Overall
- [Short summary of what the change does]
- [High-level assessment of correctness and risk]

## File: path/to/file.ts
- [Observation or suggestion]
- [Another observation, if any]

## File: other/file.tsx
- [Observation]
```

Guidelines:

- **No explicit severity labels are required.** Instead:
  - Put **more important/bug-like issues first** under each file.
  - Use wording like "This will likely break when ..." or "This is a correctness issue because ..." to signal importance.
- When referring to locations:
  - Mention the **function, component, or block name**.
  - Optionally mention a line range if available (e.g. "around the new `handleSave` implementation").

If there are **no significant issues** in a file, you may omit it or say:

```markdown
## File: path/to/file.ts
- Looks good to me; no issues spotted with correctness or clarity.
```

---

## What to look for (priorities)

Within each file, prioritize feedback in this order:

1. **Correctness and bugs**
   - Does the code do what it claims?
   - Are there obvious failing conditions not handled?
   - Are there type mismatches, unsafe casts, or unchecked assumptions?
   - Are return values and error paths handled appropriately?
2. **Edge cases**
   - How does the code behave with empty inputs, large inputs, or unexpected but legal values?
   - Are asynchronous flows robust to failures, timeouts, or partial success?
   - Are there race conditions or ordering assumptions?
3. **High-impact simplifications**
   - Can complex logic be simplified or made more explicit?
   - Are there opportunities to reuse existing helpers or patterns instead of duplicating logic?
4. **Alignment with local patterns (light)**
   - Is the code consistent with nearby code and project practices where it matters?
   - Does it follow obvious patterns for error handling, typing, and layering?

Do **not** spend much time on:

- Pure formatting when an auto-formatter would fix it.
- Purely stylistic preferences that do not affect correctness or clarity.

---

## Tone and style

Reviews should be:

- **Direct and concise** – get to the point quickly.
- **Actionable** – each comment should suggest what to change or what to consider.
- **Assumptive of good intent** – treat the author as a teammate; avoid overly harsh language.

Examples of good phrasing:

- "This can fail when X because Y. Consider handling Z case by ..."
- "If `value` can be null here, this branch will throw. It may be safer to ..."
- "This logic duplicates what `fooFromBar` already does; reusing that helper could simplify this block."

---

## When to ask questions

If something is unclear or appears inconsistent, consider asking the user:

- When a behavior might be intentional but surprising.
- When a design choice conflicts with an existing pattern in a non-obvious way.
- When scope is uncertain (e.g. whether a missing test or edge case is deliberately out of scope).

Keep such questions:

- Short and specific.
- Limited in number – do not turn the review into an interrogation unless correctness truly depends on the answer.

---

## Summary checklist for each review

Before finishing a review, quickly check:

- [ ] I understand what the change is trying to do and summarized it in **Overall**.
- [ ] I have walked each changed file and commented on:
  - [ ] Clear correctness or bug risks.
  - [ ] Important edge cases that may be missing.
  - [ ] Any high-impact simplifications worth suggesting.
- [ ] I have lightly considered local conventions and consistency where clearly relevant.
- [ ] My feedback is organized per file and is concise and actionable.

