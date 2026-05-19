# Portless Dev Environment

## Context

Work increasingly happens across several git worktrees at once — multiple
agents iterating on different branches, with a human jumping between them to
verify the results. The previous dev setup made that painful:

- The frontend (Vite/React Router, `:5173`) and server (`:3000`) used fixed
  ports, so a second worktree's dev servers collided with the first.
- Postgres (`:5432`) and Redis (`:6379`) came from a single `docker-compose`
  stack with fixed host ports and `container_name`s, so every worktree shared
  one database whether that was wanted or not — and a destructive migration in
  one worktree affected all of them.
- Browser cookies/storage are scoped to `localhost` regardless of port, so
  switching worktrees leaked auth state between them.

We want two things: zero-friction parallel worktrees, and a per-worktree
choice between *shared* resources (fast, for verifying UI work) and *isolated*
resources (a standalone database, for migration work).

## Decision

- **Portless for the browser-facing URL.** [Portless](https://github.com/vercel-labs/portless)
  is a root-level dev dependency. It runs one shared reverse-proxy daemon and
  gives the frontend a stable `https://mal.localhost` URL — and, in a linked
  worktree, `https://<worktree>.mal.localhost` automatically. Each worktree
  gets a distinct origin, so there are no port conflicts and no cookie leakage
  between worktrees. All Portless commands are wrapped in `package.json`
  scripts (`dev`, `proxy:start`/`proxy:stop`, `portless:trust`/`list`/`clean`).

- **Backend stays behind the `/api` proxy, not its own subdomain.** The server
  has no Portless URL. The frontend's Vite dev server proxies `/api` and
  `/.well-known` to it, exactly as before, so the browser only ever sees one
  origin (no CORS, no cookie split) and dev matches the eventual production
  shape. The proxy target is now read from `SERVER_URL` instead of being
  hard-coded.

- **`scripts/dev-env.mjs` orchestrates the two processes.** Portless wraps a
  single dev command, so a small Node wrapper runs the frontend through
  Portless and the backend as a plain process. It allocates the backend a
  free port (passed to the frontend as `SERVER_URL` and to the server as
  `PORT`), detects the Portless URL from its output, and passes that to the
  server as `APP_BASE_URL`.

- **Shared vs. isolated resources is our own wiring; Portless does not manage
  databases.** `docker-compose.yml` host ports and volume paths are
  parameterised (`MAL_DB_PORT`, `MAL_REDIS_PORT`, `MAL_ADMINER_PORT`,
  `MAL_STACK`), all defaulting to the original shared-stack values.
  - `pnpm dev` — shared mode. Connects to the shared stack on the fixed ports.
  - `pnpm dev:isolated` — isolated mode. Brings up a standalone per-worktree
    stack (`docker compose -p mal-<worktree>`) on free ephemeral ports, writes
    a gitignored `apps/server/.env.portless.local` pointing `DATABASE_URL` /
    `REDIS_HOST` / `REDIS_PORT` at it, and runs `drizzle-kit push` to create
    the schema. `pnpm dev:isolated:down` tears that stack down.

- **`.env.portless.local` is the override channel.** The server's `tsx` and
  `drizzle.config.ts` both load it last, so isolated-mode resource overrides
  win over `.env.local`. Shared mode deletes any stale copy so it falls back
  cleanly. This is what lets `drizzle-kit` target the same isolated database
  the dev server uses, which is the point of isolated mode.

- **`REDIS_PORT` added to the server env.** The Redis connection previously
  took only a host; isolated stacks need a non-default port, so `env.ts` now
  parses `REDIS_PORT` (default `6379`) and `WorkflowQueues` takes host + port.

## Consequences

- One-time per machine: `pnpm portless:trust` (trusts the local CA) and
  optionally `portless service install` (auto-starts the proxy on login).
- Worktree login state is correctly isolated: each worktree is its own
  `https://<worktree>.mal.localhost` origin, so verifying one agent's branch
  does not disturb a session on another.
- Redis dev data moved from `.devloop/volumes/redis` to
  `.devloop/volumes/my_agent_loop/redis` (so isolated stacks can namespace
  their own volumes). Existing shared Redis data — only BullMQ queue/cache
  state — is orphaned once and recreated; Postgres data is unaffected.
- The shared stack is owned by the primary checkout; `pnpm dev` does not
  auto-start it (a linked worktree starting it would create a divergent
  stack against its own `.devloop`). Run `pnpm db:up` there; shared `pnpm dev`
  warns if Postgres/Redis are unreachable.
- The server dev script still passes `--inspect`, which uses a fixed debugger
  port; running many worktree servers at once will leave all but the first
  without an attached inspector. The app port itself is always conflict-free.
- `pnpm dev:moon` preserves the old `moon :dev` path if it is ever needed.
