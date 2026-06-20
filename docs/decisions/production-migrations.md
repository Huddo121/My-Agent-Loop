# Decision: Production database migrations

## Context

Production previously created and updated the schema with `drizzle-kit push`,
which diffs the live database against `src/db/schema.ts` and applies whatever
changes it infers. That is convenient in development but unsafe for a deployed
host:

- It needs the Drizzle CLI, the TypeScript schema source, and a network path to
  Postgres on the production host — none of which should be required there.
- It is non-deterministic across versions: the change applied depends on the
  current database state, not on a reviewed, committed artifact.
- It offers no record of what ran, and no story for rolling an application
  version back across a schema change.

The deployment model is immutable images pulled onto the host; the host should
not hold source, pnpm, or compilers. Schema changes need to travel with the
image as a reviewed artifact, not be recomputed on the host.

## Decision

Schema changes are committed, forward-only SQL migrations applied by a dedicated
one-shot process.

- `drizzle-kit generate` produces SQL + metadata under `apps/server/drizzle/`,
  which is committed and code-reviewed. `pnpm --filter @mono/server db:generate`
  wraps it. `drizzle-kit push` is no longer used for production.
- `apps/server/src/db/migrate.ts` is a standalone entrypoint that reads only
  `DATABASE_URL` — it deliberately does not import the server `envSchema`, so the
  migrator holds none of the application's runtime secrets. It runs Drizzle's
  runtime migrator against the bundled migrations folder and exits non-zero on
  failure.
- `build.mjs` emits `dist/migrate.js` alongside `dist/index.js` and copies the
  `drizzle/` tree into `dist/`, so the production image carries the migrations
  with no raw TypeScript or Drizzle CLI.
- `docker-compose.prod.yml` exposes a `migrate` service that reuses the exact
  server image on the internal `app-net`. It is gated behind the `tools` profile
  so a normal `up` never reruns it; the deployer runs it once, after Postgres is
  healthy and before replacing the app containers, and aborts the rollout on
  failure.

Migrations are **forward-only** and follow an **expand/contract** discipline:
add new columns/tables first, migrate reads/writes, then remove the old shape in
a later release. This keeps each migration backward-compatible with the
previously deployed application, which is what makes an application-only rollback
(redeploying the prior image without touching the schema) safe.

Database rollback is **not** automated. There are no down migrations. Recovery
from a bad schema change is a restore from backup, not an automatic reversal.

The initial migration assumes a **fresh** production database. A database that
was previously created with `drizzle-kit push` must be given an explicit one-time
baseline (marking the initial migration as already applied) before the migrator
runs against it — never run the migrator blindly against a pushed database and
never mark a migration applied just because the tables happen to exist.

## Consequences

- The production host needs neither source, pnpm, the Drizzle CLI, nor a network
  path to Postgres to apply schema changes.
- What runs against production is exactly what was reviewed and committed.
- Contributors must run `db:generate` and commit the result when they change
  `schema.ts`; CI checks that generated migrations are consistent with the
  schema.
- Schema changes that cannot be expressed as a backward-compatible expand step
  require a deliberate multi-release plan rather than a single migration.
