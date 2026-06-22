# Required Checks and the CI Merge Gate

## Context

`ci.yml` runs several jobs on every pull request (see
[CI Pipeline and Native-Build Guard](./ci-and-native-build-guard.md)), but
running a check is not the same as *requiring* it. Until this decision, `main`
had no branch protection or ruleset, so:

- CI could be red and the PR would still merge, and
- because there was no merge requirement at all, GitHub never offered
  "Enable auto-merge" — only a plain "Merge" button.

The obvious fix — list every CI job as a required status check — means the list
of required checks has to be kept in sync by hand, in a place
(branch-protection settings) that lives outside the repo and isn't reviewed in a
PR. Every time someone adds or renames a job, they'd have to remember to update
that out-of-band list too.

## Decision

### One aggregate `CI gate` job is the only required check

`ci.yml` defines a single `ci-gate` job that `needs` every other CI job. Branch
protection requires exactly one status check — `CI gate` — and nothing else.

The in-repo `needs:` list is therefore the source of truth for what must pass
to merge. **To make a new job required, add it to `ci-gate`'s `needs:` list.**
Do not touch the ruleset for this — that's the whole point of the pattern.

### The gate must always run and inspect its dependencies

A job with `needs:` is itself *skipped* when any dependency fails or is
cancelled. A skipped required check never reports a status, which wedges the PR
forever on "Expected — Waiting for status to be reported." So the gate runs with
`if: ${{ always() }}` and then inspects `needs.*.result`, failing if any
dependency is `failure` or `cancelled`:

```yaml
  ci-gate:
    name: CI gate
    if: ${{ always() }}
    needs: [lint, typecheck, test, migrations, native-builds, moon-sync, build]
    runs-on: ubuntu-latest
    steps:
      - name: Verify all required jobs succeeded
        if: ${{ contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled') }}
        run: |
          echo "::error::One or more required CI jobs did not succeed."
          exit 1
```

A `cancelled` run is treated as a failure on purpose: `ci.yml`'s `concurrency`
group cancels superseded runs, and a cancelled run must not pass as green.

We deliberately did *not* use a third-party action (e.g. `re-actors/alls-green`)
for this. Its extra features (`allowed-skips` / `allowed-failures`) only pay off
once there are conditional or experimental jobs, which there aren't — and it
would add a third-party action to the one job that gates everything, against the
grain of how this repo pins versions and allow-lists dependencies. Revisit that
trade-off if a job is ever allowed to skip or fail; if you do adopt it, pin it
to a full commit SHA, not a branch.

### The ruleset lives server-side, not in the repo

GitHub stores rulesets and branch protection server-side. There is no file in
this repo that GitHub reads to configure them — so the requirement cannot be
changed via a PR. It was applied once, by a repo admin, with `gh`:

```bash
gh api repos/{owner}/{repo}/rulesets -X POST --input - <<'JSON'
{
  "name": "main protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "CI gate" }]
      }
    }
  ]
}
JSON
```

`strict_required_status_checks_policy` is `false` on purpose: GitHub's
auto-merge does not auto-update a behind branch, so requiring the branch be
up-to-date would stall auto-merge whenever `main` moves ahead.

Repo-level "Allow auto-merge" is already enabled; the required check is what
makes the "Enable auto-merge" button appear on PRs.

## Consequences

- **Adding a required check:** add the job to `ci.yml`, then add its job id to
  `ci-gate`'s `needs:` list. No ruleset change.
- **Renaming the gate is a trap.** The ruleset requires the literal context
  string `CI gate`. If you change the `ci-gate` job's `name:`, the ruleset will
  keep waiting for a `CI gate` status that never arrives and every PR will
  wedge. Don't rename it without an admin updating the ruleset's
  `required_status_checks` context to match.
- A required check is only recognised once GitHub has seen it report at least
  once. The PR that first introduces or renames the gate is self-bootstrapping
  (its own run produces the status), but expect a first run before the gate
  shows as satisfied.
- Editing the ruleset (the rare case) requires repo-admin access and a manual
  `gh api` call or the GitHub UI — the default `GITHUB_TOKEN` cannot manage
  rulesets, so this can't be automated from within CI without a stored PAT.
