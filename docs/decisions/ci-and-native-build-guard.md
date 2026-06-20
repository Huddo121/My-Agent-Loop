# CI Pipeline and Native-Build Guard

## Context

MAL started as an experimental project, and quality enforcement was left to
whoever (or whichever agent) happened to be looking. As more people and agents
work on it, that doesn't hold: deterministic checks like formatting, linting,
and type errors should be caught by tooling on every change, not by review.

The only existing workflow was `sync-agents.yml`, which regenerates the agent
files and fails if the committed output drifted. We wanted the same treatment
for the rest of the project's mechanically-decidable rules.

There was also a specific supply-chain concern. pnpm refuses to run a
dependency's install/build scripts unless that dependency is allow-listed in
`onlyBuiltDependencies`, which is good — but the *decision* to ignore a
package's build script was invisible. A new dependency could introduce a native
build (or an arbitrary `postinstall`) and pnpm would silently skip it, with
nobody reviewing whether that was the right call.

## Decision

### A single `ci.yml` with one job per check

Rather than a workflow file per check, CI lives in one `ci.yml` running on pull
requests and pushes to `main`, with `concurrency` cancellation so superseded
runs don't pile up. Jobs run in parallel and share setup through a composite
action at `.github/actions/setup` (pnpm + Node from `.nvmrc` + a frozen-lockfile
install). Using `--frozen-lockfile` everywhere also enforces a committed,
in-sync lockfile for free.

The jobs:

- **Lint & format** — `pnpm check` (Biome).
- **Typecheck** — `pnpm typecheck`.
- **Tests** — `pnpm test`. The frontend runs Storybook stories in a real
  Chromium via Playwright, so the job runs inside the official Playwright
  container image (browsers and their system libraries preinstalled). The image
  tag tracks the `playwright` version in `apps/frontend`; downloading the
  browser per run stalled intermittently on the runner's network and apt locks.
- **Native build allow-list** — `pnpm check:native-builds` (see below).
- **Moon sync** — `pnpm sync` followed by `git diff --exit-code`, mirroring the
  `sync-agents` drift check, so committed tsconfig project references can't go
  stale.
- **Build (affected)** — `moon ci`, which compares against a base revision and
  builds only the affected projects. This is why the job checks out with
  `fetch-depth: 0`.

`moon` is pinned to the locally-used version via the `moon-version` input on
`setup-toolchain` (a workflow-level `MOON_VERSION`), because the action
otherwise installs the latest moon, whose config schema rejects this repo's
moon.yml files (which use the 1.x `local` task field).

### Typecheck and tests are made reproducible from a clean checkout

`tsc --build` alone fails on a fresh checkout because the frontend's React
Router `+types` are generated and git-ignored. The root `typecheck` and `test`
scripts now run a `typegen` step first, so both work identically for a developer
and in CI.

### A native-build guard with explicit classification

Every dependency that declares a gated build script
(`preinstall`/`install`/`postinstall`) must be consciously classified in
`pnpm-workspace.yaml` as one of:

- `onlyBuiltDependencies` — reviewed, and pnpm should run its build, or
- `ignoredBuiltDependencies` — reviewed, and pnpm should skip its build.

`scripts/src/check-native-builds.ts` scans the installed dependency tree for
build scripts and fails if any such dependency is in neither list (a new,
unreviewed native build) or if a listed entry no longer has a build script (a
stale entry). A new native build then blocks CI until a human triages it,
instead of being silently ignored.

Setting up the baseline immediately surfaced two packages pnpm had been quietly
ignoring — `better-sqlite3` and `@prisma/client` — both optional peer
drivers/adapters pulled in by drizzle-orm and better-auth for databases this
project doesn't use (it runs on Postgres). They're now explicitly listed under
`ignoredBuiltDependencies`.

## Consequences

- New deterministic rules should be added as CI jobs (or folded into Biome /
  tsconfig) rather than relying on review.
- Adding a dependency with a build script will fail CI until it's classified in
  `pnpm-workspace.yaml`. This is intentional friction; never add an unreviewed
  package to `onlyBuiltDependencies` just to silence the check.
- The `build` job leans on moon's own toolchain setup in CI, which is the one
  part not exercised by local development — worth watching on early runs.
