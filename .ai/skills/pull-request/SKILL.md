---
name: pull-request
description: >
  Raises GitHub pull requests and handles PR feedback for this repository.

  TRIGGER WHEN: The user asks to raise, open, or submit a PR, create a pull request, push the current branch for review, or respond to comments on an existing PR.
---

# Pull Request

## Purpose

This skill covers the full lifecycle of a pull request in this repository: branching, pre-flight checks, commit hygiene, PR creation, and responding to review feedback.

When the user asks to raise a PR, you do not need to ask permission first — PRs in this repo are safe to raise and editable. Just do it.

## Branch naming

Use `feature/short-description-of-feature` — lowercase, hyphenated, descriptive of the change.

If you're not already on a feature branch when the user asks for a PR, create one off `main` before committing.

## Before raising the PR

Run these from the repo root and resolve all issues before opening the PR:

- `pnpm typecheck`
- `pnpm check`
- Tests for the packages you changed (e.g. `pnpm --filter @mono/api test:run`)

Then self-review the diff:

- `git diff main...HEAD` — read every line yourself before a reviewer does
- Remove debug output, commented-out code, and accidental file moves
- Confirm only files you intended to change are modified

Push the branch and confirm it's tracking remote: `git push -u origin <branch>`.

## Commits

- Sentence-case imperative title, short (under ~50 chars). Examples from this repo: "Add OAuth transfer via CLI", "Refine reverse proxy deployment plan".
- Optional body explaining *why* the change was made — not what (the diff shows what). Wrap at ~72 chars.
- Never include a `Co-Authored-By` trailer. Claude Code has this disabled globally; other harnesses must also respect it.
- Never amend or force-push commits that have been pushed to a PR (see the feedback section below).

## PR description format

Use these sections, in this order. Optional sections may be omitted entirely when not applicable — do not leave empty headings.

```markdown
## What this PR introduces

One paragraph or a few bullets describing the change, written for someone who hasn't been following this work.

## Context

What the previous / current state of the codebase was, and why it was a problem worth fixing. This is the section reviewers reach for when asking "why is this needed?"

## Decisions

The non-obvious choices made: tradeoffs considered, alternatives rejected, constraints honored. Skip points that are obvious from reading the diff.

## Follow-ups (optional)

What is intentionally left for a later PR. Include only when the PR does not fully solve the underlying issue.

## Review guide (optional)

For larger PRs, suggest a reading order — which file to start with, which commits to read separately, what to skim. Skip for small PRs.
```

## Raising the PR

Use `gh pr create` with a HEREDOC body for formatting. Open as a regular PR — not a draft — this is a single-developer repo.

Title:
- Under 70 characters
- Sentence-case imperative, no trailing period
- Matches the style of recent commit titles

Example:

```bash
gh pr create --title "Unify skills and agents across harnesses" --body "$(cat <<'EOF'
## What this PR introduces

...

## Context

...

## Decisions

...
EOF
)"
```

Return the PR URL when done.

## Responding to PR feedback

Prefix every response with a tag identifying which agent wrote it: `[CLAUDE]`, `[CODEX]`, `[COMPOSER]`, or `[OPENCODE]` — capitalized, in square brackets, at the start of the comment.

For each comment thread, do exactly one of:

1. **Apply the change** — make the fix, then reply explaining what you did.
2. **Push back** — if the code was written a particular way because of a documented standard or practice (in `AGENTS.md`, `docs/`, or `docs/decisions/`), cite the document and explain why the existing code stands.
3. **Ask for clarification** — when the comment is ambiguous and you can't confidently choose between (1) and (2).

Never silently ignore a comment. Pushing a fix without replying doesn't count as responding.

### Documentation updates for undocumented preferences

If the user's feedback introduces a preference not currently captured in `docs/` or `AGENTS.md`, after addressing the comment also propose a documentation update in the appropriate file (typically `docs/02-coding-practices.md`, or a new ADR in `docs/decisions/`).

This is how the documentation grows over time so future agents make the right choice without needing the same correction.

### Reading and replying to comments

- Top-level review threads: `gh pr view <n> --comments`
- Inline comments on the diff: `gh api repos/<owner>/<repo>/pulls/<n>/comments`
- Reply to top-level comments: `gh pr comment <n> --body "..."`
- Reply to inline review threads: `gh api -X POST repos/<owner>/<repo>/pulls/<n>/comments` with `in_reply_to` set to the comment id
- Address feedback as **new commits**, not amends or force-pushes — reviewers need to see exactly what changed since their last review.
- Do not mark review threads as resolved yourself; let the reviewer.

## CI failures

The `Sync agents` GitHub Action fails the build if generated agent files drift from `.ai/agents/`. If this fires, run `pnpm sync-agents` locally, commit the result, and push.

For any other CI failure, fix the underlying problem locally and push a new commit. Do not retry CI hoping the failure was flaky without first reading the log.

## Never

- Push directly to `main`. Always open a PR.
- Auto-merge a PR. Leave merging to the user unless they explicitly ask.
- Force-push to a PR branch that has already received review.
- Amend or rebase commits that have been pushed.
- Skip pre-flight checks "just to see what CI says".
