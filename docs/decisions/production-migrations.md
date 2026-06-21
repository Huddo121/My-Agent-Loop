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

Schema changes are committed, forward-only SQL migrations that the server applies
itself on boot, before it begins serving.

- `drizzle-kit generate` produces SQL + metadata under `apps/server/drizzle/`,
  which is committed and code-reviewed. `pnpm --filter @mono/server db:generate`
  wraps it. `drizzle-kit push` is no longer used for production.
- `apps/server/src/db/run-migrations.ts` runs Drizzle's runtime migrator against
  the bundled migrations folder. `index.ts` calls it on startup — but only when
  `NODE_ENV=production`, and before any code touches the database — then aborts
  the process (exit 1) if it fails, so the container never serves traffic against
  a half-migrated schema and the rollout's healthcheck never goes green. It is
  idempotent: Drizzle skips migrations already recorded in `__drizzle_migrations`,
  so a restart re-runs it harmlessly.
- Development is deliberately excluded from the on-boot path. It manages schema
  with `drizzle-kit push`, and running these migrations against a push-built
  database would fail (the tables already exist with no `__drizzle_migrations`
  ledger). The gate keeps the two workflows from colliding.
- `build.mjs` copies the `drizzle/` tree into `dist/` next to `dist/index.js`, so
  the production image carries the migrations with no raw TypeScript or Drizzle
  CLI.
- A deploy is therefore just a `docker compose up` of the production project
  (`deploy/application/compose.yaml`, driven by the deploy script): the operator
  runs no migrate step, and there is no second image or one-shot container to
  keep in sync. This assumes a single server instance, which the
  deployment already is (it manages sandboxes through the host Docker socket);
  Drizzle's migrator is not coordinated across replicas, so scaling the server
  horizontally would require reintroducing a dedicated migrate step that runs
  once before the replicas start.

Migrations are **forward-only** and follow an **expand/contract** discipline:
add new columns/tables first, migrate reads/writes, then remove the old shape in
a later release. This keeps each migration backward-compatible with the
previously deployed application, which is what makes an application-only rollback
(redeploying the prior image without touching the schema) safe.

Database rollback is **not** automated. There are no down migrations. Recovery
from a bad schema change is a restore from backup, not an automatic reversal.

The initial migration assumes a **fresh** production database. A database that
was previously created with `drizzle-kit push` must be given an explicit one-time
baseline (marking the initial migration as already applied) before the server
first boots against it — never let the migrator run blindly against a pushed
database and never mark a migration applied just because the tables happen to
exist.

## Consequences

- The production host needs neither source, pnpm, the Drizzle CLI, nor a network
  path to Postgres to apply schema changes.
- What runs against production is exactly what was reviewed and committed.
- Contributors must run `db:generate` and commit the result when they change
  `schema.ts`; CI checks that generated migrations are consistent with the
  schema.
- Schema changes that cannot be expressed as a backward-compatible expand step
  require a deliberate multi-release plan rather than a single migration.
