---
name: automated-production-deploy
overview: Replace production schema pushes with committed migrations, publish immutable amd64 MAL images to GHCR, and deploy successful main builds to deimos through a narrowly authenticated webhook notifier and a host-owned transactional deployment service rooted at /home/services/mal.
todos:
  - id: production_migrations
    content: Generate and commit the initial Drizzle migration, add a bundled migration entrypoint to the server image, add a one-shot Compose migration service, and remove drizzle push from production instructions
    status: pending
  - id: immutable_images
    content: Publish commit-SHA-tagged amd64 server, frontend, sandbox, webhook, and deployment-bundle images to GHCR; convert production Compose to image references; and make the runtime sandbox image configurable
    status: pending
  - id: host_deployer
    content: Add the /home/services/mal release layout, bootstrap assets, systemd queue units, and an idempotent locked deploy script that extracts an exact release, migrates, rolls out, reapplies firewall rules, health-checks, and records rollback state
    status: pending
  - id: webhook_receiver
    content: Add the isolated webhook receiver app, authenticated deploy-notification contract, replay protection, atomic host queue, webhook.incredibleplatform.com Traefik route, and a dedicated proxy network separated from agent sandboxes
    status: pending
  - id: deploy_notification
    content: Notify deimos only after every image for a successful main build exists, using a signed canonical payload, main-build concurrency control, retries, and GitHub production environment secrets
    status: pending
  - id: production_rollout
    content: Document and verify initial deimos bootstrap, GHCR authentication, DNS, secrets, migration and deployment failure behavior, rollback, reboot recovery, and an end-to-end merge-to-main deployment
    status: pending
isProject: false
---

# Automated production deployment

## Context

My Agent Loop (MAL) is deployed to the amd64 Linux host `deimos` with Docker
Compose. The persistent host deployment root is `/home/services/mal`; source
code, pnpm and compilers should not be required there after bootstrap. The
directory owns deployment configuration and state while application processes
remain containers:

```text
/home/services/mal/
├── .env                         # operator secrets; never replaced by a release
├── current -> releases/<sha>/   # active immutable deployment bundle
├── releases/<sha>/              # Compose, Traefik and host scripts for one SHA
├── deploy/
│   ├── queue/incoming/          # authenticated requests awaiting deployment
│   ├── queue/receipts/          # persistent replay-prevention markers
│   ├── queue/processed/         # archived successful/superseded requests
│   ├── queue/failed/            # archived failed requests
│   ├── logs/
│   ├── current-sha
│   ├── previous-sha
│   └── current-run-id
└── runs/                        # MAL_RUNS_DIR, bind-mounted at the same path
```

The existing production implementation is in:

- `docker-compose.prod.yml`: server, static frontend, Traefik, Postgres and
  Redis. It currently builds server/frontend locally.
- `apps/server/Dockerfile` and `apps/server/build.mjs`: packaging-only server
  image. esbuild bundles first-party TypeScript while real dependencies remain
  external in a `pnpm deploy` artifact.
- `apps/frontend/Dockerfile`: packaging-only nginx SPA image.
- Root `Dockerfile`: agent sandbox image containing the prebuilt Linux driver.
- `apps/server/src/sandbox/SandboxService.ts`: creates sibling Docker
  containers on `mal-sandbox-net`; the image is currently hard-coded as
  `my-agent-loop`.
- `apps/server/drizzle.config.ts` and `apps/server/src/db/schema.ts`: Drizzle
  schema configuration. Production currently relies on `drizzle-kit push` and
  has no committed `apps/server/drizzle/` migrations.
- `traefik/`: static and dynamic file-provider templates. Traefik owns host
  ports 80/443 and currently routes only the application hostname.
- `scripts/configure-production-firewall.sh`: host `DOCKER-USER` and `INPUT`
  policy for traffic entering from `mal-sandbox-net`.
- `.github/workflows/sync-agents.yml`: the only current GitHub Actions workflow;
  there is no general CI, image publication or deployment workflow.

The deployment notification hostname is
`webhook.incredibleplatform.com`. A raw GitHub repository push webhook must not
drive deployment because it arrives before the images for that commit exist.
Instead, a GitHub Actions job sends the notification only after all immutable
artifacts have been published successfully.

## Design decisions

### Immutable artifacts and host pull

- GitHub-hosted Actions build Linux amd64 artifacts and publish them to GHCR.
- Every MAL-owned image is tagged with the full merge commit SHA. Deployment
  always uses the SHA tag; `latest` or mutable `main` tags must not determine
  production state.
- Publish separate server, frontend, sandbox and webhook images. The server
  image also contains the migration entrypoint and committed SQL migrations;
  the Compose `migrate` service reuses that exact server image rather than
  duplicating dependencies in a separate image.
- Publish a small deployment-bundle image containing only the production
  Compose file, `traefik/`, host deployment scripts, systemd unit templates and
  relevant documentation. The host deployer extracts `/bundle` from the exact
  SHA-tagged image with `docker create`/`docker cp`. No Git checkout is needed on
  `deimos`.
- `deimos` authenticates to private GHCR packages with an operator-provisioned
  read-only package credential. GitHub Actions publishes with its scoped
  `GITHUB_TOKEN` and `packages: write`.

### Committed forward migrations

- Use `drizzle-kit generate` during development and commit generated SQL and
  metadata under `apps/server/drizzle/`.
- Add a Node migration entrypoint using Drizzle's runtime migrator and requiring
  only `DATABASE_URL`. Do not load the full server `envSchema` for migrations.
- Bundle the migration entrypoint alongside `dist/index.js` and copy the
  migrations into the deploy artifact so raw TypeScript is not required in
  production.
- Run migrations once, after Postgres is healthy and before replacing app
  containers. Abort the rollout on migration failure.
- Database rollback is not automated. Application rollback is supported only
  across backward-compatible migrations. Use expand/contract schema changes.
- The initial migration assumes a fresh production database. If an existing
  production database was previously created with `drizzle push`, stop and
  perform an explicit one-time baseline rather than attempting to infer or
  rewrite migration history automatically.

### Authenticated notifier, not a privileged webhook

- Add a small `apps/deploy-webhook` Node 24 app using existing project choices
  (`@hono/node-server`, Hono and Zod). It is a separate container and process,
  not a route in the MAL server, so deployments and MAL outages do not couple
  its privilege boundary to the application.
- The receiver has no Docker socket, no GHCR credential, no access to `.env`,
  and no writable deployment release directory. Its only writable bind mount is
  `/queue`, backed by `/home/services/mal/deploy/queue`.
- GitHub Actions POSTs the exact UTF-8 JSON body to `POST /deploy`. Sign the raw
  bytes with HMAC-SHA256 using a high-entropy shared secret and send
  `X-MAL-Signature-256: sha256=<lowercase hex>`. Compare fixed-length digests
  with `crypto.timingSafeEqual`; never parse before signature verification.
- The validated payload is:

  ```json
  {
    "repository": "Huddo121/My-Agent-Loop",
    "ref": "refs/heads/main",
    "sha": "<40 lowercase hex characters>",
    "runId": "<GitHub numeric workflow run id>",
    "runAttempt": 1
  }
  ```

- Enforce the exact repository and ref from receiver configuration, a lowercase
  40-character SHA, decimal positive `runId`, positive integer `runAttempt`,
  `Content-Type: application/json`, and a small request limit (16 KiB maximum).
- The replay key is `<runId>.<runAttempt>`. Create a receipt with exclusive
  filesystem semantics before accepting the queue entry. Receipts persist even
  after queue processing. Write queue files through a same-directory temporary
  file plus atomic rename.
- Return `202` only after durable enqueue, `401` for missing/invalid signatures,
  `400` for invalid signed payloads, `409` for replay, and `413` for oversized
  requests. The request does not wait for deployment completion.

### Host-owned deployment transaction

- A systemd path unit watches `queue/incoming`; a root-owned oneshot service
  invokes a fixed deployment script. The receiver cannot choose a command,
  image repository, Compose path or host destination.
- Validate every value again in the host script. Never `eval` queue contents or
  interpolate them into shell fragments. Image namespaces are constants owned
  by the script; the queue supplies only the SHA and monotonically increasing
  GitHub run identity.
- Use `flock` so only one deployment transaction runs. GitHub workflow
  concurrency cancels obsolete in-progress main builds before notification.
  The host rejects a notification whose numeric run ID is not newer than the
  last successfully deployed run ID.
- Extract a release to a temporary directory, verify required files, then rename
  it to `releases/<sha>`. Keep `.env` outside releases.
- Pull all exact image tags, start Postgres/Redis, run the one-shot migration,
  update `current`, run Compose, wait for health, reapply the sandbox firewall,
  and perform external HTTPS checks. Only then update `current-sha`,
  `previous-sha` and `current-run-id` and archive the request as processed.
- On failure, preserve logs and move the request to `failed`. If failure occurs
  after switching the application, restore the previous release/application
  images when compatible; never attempt to reverse a database migration.

### Three networks, not two

The current firewall matches all source addresses on `mal-sandbox-net`. Because
Traefik and the frontend currently share that bridge with sandboxes, the rule
which drops sandbox-to-peer traffic can also drop Traefik-to-frontend traffic.
Do not weaken the firewall to allow arbitrary peers. Introduce:

- `app-net` (internal): server, Postgres, Redis and the one-shot migrator.
- `proxy-net`: Traefik, frontend, webhook receiver and server.
- `mal-sandbox-net`: server and dynamically created agent containers only.

The server becomes triple-homed. Sandboxes continue to reach
`http://server:3000` and `http://server:3050/mcp` through service DNS on their
dedicated bridge. The firewall can then identify untrusted ingress by the
sandbox bridge without blocking proxy traffic. Update the existing architecture
decision to explain this required divergence from the earlier dual-homed shape.

### Scope and deployment feedback

- Version one records detailed status in systemd/journald and
  `/home/services/mal/deploy/logs`; the notification workflow proves only that
  the request was durably accepted.
- Reporting final deployment status back into the originating GitHub workflow,
  commit status or deployment API is deferred. Do not keep the webhook HTTP
  request open for a potentially long deployment.

## Implementation guide

### 1. Production migrations

Modify:

- `apps/server/drizzle.config.ts`: retain `out: "./drizzle"` and schema/casing.
- `apps/server/package.json`: add explicit `db:generate` and production migration
  commands. Use `pnpm` commands to change dependencies/scripts rather than
  editing dependency declarations by hand.
- `apps/server/build.mjs`: build two ESM entrypoints (`src/index.ts` and a new
  migration entrypoint), preserving the current first-party alias/external
  dependency strategy; copy `apps/server/drizzle/` into the runtime output.
- `apps/server/Dockerfile`: document the additional migration command; it
  remains a packaging-only image.
- `docker-compose.prod.yml`: add a `migrate` service using the server image,
  `app-net`, only `DATABASE_URL`, Postgres health dependency, `restart: "no"`
  and a tools profile so normal `up` does not rerun it unexpectedly.
- `README.md` and a new `docs/decisions/production-migrations.md`: replace schema
  push instructions and record forward-only/expand-contract policy. The docs
  index already lists the Decisions folder and must not list the individual
  decision record.

Create:

- `apps/server/src/db/migrate.ts`: parse `DATABASE_URL` at this process boundary,
  create/close its own PostgreSQL client, call Drizzle's migrator with the copied
  migrations folder relative to `import.meta.url`, log a concise result, and
  exit non-zero on failure.
- Generated `apps/server/drizzle/**`: create using the installed Drizzle CLI,
  not handwritten SQL or metadata.

Test generation and runtime migration against a fresh disposable Postgres
container. Run it twice to prove idempotence. Confirm a deliberately invalid
database URL exits non-zero and does not report success.

### 2. Immutable images and publication

Modify:

- `apps/server/src/env.ts`, `apps/server/src/services.ts` and
  `apps/server/src/sandbox/SandboxService.ts`: add `MAL_SANDBOX_IMAGE`; default to
  `my-agent-loop` only for development, require/pass the resolved string at the
  composition edge, and use it in `createContainer`. Update adjacent tests to
  assert the configured image is sent to Docker.
- `docker-compose.prod.yml`: replace MAL-owned `build:` sections with GHCR
  `image:` references using required `${MAL_IMAGE_TAG:?}` interpolation. Pass
  the exact sandbox image reference into the server. Keep official Traefik,
  Postgres and Redis images pinned independently.
- `.env.example`: add deployment/image/webhook variables with production values
  rooted at `/home/services/mal`; use Compose's required-variable syntax for
  production-critical settings where practical.
- Production image comments and README build instructions: distinguish local
  smoke builds from registry-based deployment.

Create:

- `.github/workflows/ci.yml`: PR and main checks for install, generated migration
  consistency, `pnpm typecheck`, the frontend typecheck workaround for the known
  React Router generated type, `pnpm check`, and relevant tests/builds.
- `.github/workflows/publish-production.yml`: main-only amd64 artifact/image
  build and GHCR publication. Use least-privilege permissions, pin third-party
  Actions to full commit SHAs, and publish only after checks pass.
- `deploy/Dockerfile`: a `scratch` deployment-bundle image with `/bundle`
  containing the production Compose file, Traefik templates, firewall script,
  deployment scripts/unit templates and deployment documentation. Do not copy
  `.env`, application source, caches or build outputs.

Publish exact SHA tags under fixed lowercase names such as:

- `ghcr.io/huddo121/my-agent-loop-server:<sha>`
- `ghcr.io/huddo121/my-agent-loop-frontend:<sha>`
- `ghcr.io/huddo121/my-agent-loop-sandbox:<sha>`
- `ghcr.io/huddo121/my-agent-loop-webhook:<sha>`
- `ghcr.io/huddo121/my-agent-loop-deployment:<sha>`

The publication workflow must prove every expected digest exists before the
notification job becomes eligible. If `deimos` architecture detection ever
changes, add multi-arch intentionally; this plan targets `linux/amd64` only.

### 3. Host deployer and bootstrap

Create under `deploy/`:

- `scripts/deploy-production.sh`: strict Bash (`set -euo pipefail`), SHA/run
  validation, `flock`, exact image pulls, deployment-bundle extraction, Compose
  orchestration, migration, health checks, firewall reapplication, state updates
  and failure archiving. Split testable parsing/validation helpers if the script
  grows; do not source queue files as shell.
- `scripts/process-deploy-queue.sh`: select/claim an incoming request atomically,
  reject older/equal run IDs, call the fixed deploy command, and drain or
  supersede queued requests deterministically.
- `scripts/rollback-production.sh`: redeploy `previous-sha` through the same
  image/config path without attempting database reversal; require explicit
  operator invocation.
- `scripts/bootstrap-deimos.sh`: idempotently create the documented directory
  layout and permissions, install systemd units, validate Docker Compose/GHCR
  login and operator `.env`, and perform an initial exact-SHA deployment. Do not
  generate or overwrite secrets.
- `systemd/my-agent-loop-deploy.path` and
  `systemd/my-agent-loop-deploy.service`: watch the incoming directory and run
  the queue processor as a root-owned oneshot after Docker is available.
- Host-script tests (Bats only if already present; otherwise a small shell test
  harness) with fake `docker`, `systemctl`, `curl` and filesystem state covering
  validation, lock contention, migration failure, health failure, success state
  update and rollback selection. Avoid adding a test framework solely for one
  script unless the simple harness becomes unmaintainable.

Use `/home/services/mal/current` as the working release and pass the persistent
`/home/services/mal/.env` explicitly to Compose. Never copy `.env` into a release
or image. Update `scripts/configure-production-firewall.sh` so it resolves the
active Compose file from this layout rather than assuming a source checkout.

Add a lightweight server health route (for example `GET /api/health`) and
container health checks that do not require an authenticated user. The deployer
must verify at least frontend HTML, API health, internal-path 403 and
`/api/internalish` non-blocking behavior through HTTPS.

### 4. Webhook receiver and proxy isolation

Create `apps/deploy-webhook/` as a normal pnpm workspace app:

- `src/index.ts` and small domain modules for raw-body authentication, payload
  parsing and queue persistence. Keep pure validation functions separate from
  Hono handlers.
- Adjacent Vitest tests for valid signatures, body tampering, wrong repository
  or ref, invalid SHA/run identity, request size, replay, filesystem failure and
  atomic queue output. Use dynamic-import `vi.mock` syntax when mocking platform
  boundaries.
- `package.json`, `tsconfig.json`, build configuration and a packaging-only
  Node 24 Dockerfile. Add dependencies with `pnpm --filter ... add`; reuse Hono,
  Zod and esbuild already present in the repository.
- A non-root runtime user, read-only root filesystem where practical, and a
  writable `/queue` mount only.

Update root TypeScript references/task configuration so root checks include the
new app without placeholder scripts. Add the webhook service to production
Compose with only `proxy-net`, no published ports, no Docker socket, and required
`DEPLOY_WEBHOOK_SECRET`, expected repository/ref and queue-path configuration.

Update Traefik templates/rendering:

- Add and validate `WEBHOOK_BASE_URL=https://webhook.incredibleplatform.com` at
  startup, deriving its hostname as the existing renderer derives the app host.
- Add a TLS router matching that exact host and `Path(`/deploy`)`, with explicit
  priority and the existing DNS-01 resolver, forwarding only to the receiver.
- Add an optional receiver health service check internally; do not expose a
  dashboard or management API.

Refactor Compose to the three-network model described above. Update
`scripts/configure-production-firewall.sh`, firewall docs and
`docs/decisions/reverse-proxy.md`, then test the rules on Linux so proxy traffic
continues while sandbox-to-peer/app/LAN/host traffic is denied.

### 5. Post-publication notification

Create a small `// @ts-check` JavaScript helper under `scripts/` to construct the
canonical JSON payload in stable key order, calculate the raw-body HMAC and POST
it with timeouts/retries. Keep the secret in an environment variable and never
print it or the signature. Unit test the canonical bytes/signature against fixed
vectors and receiver verification logic.

Extend the main publication workflow:

- Set a main-publication concurrency group with `cancel-in-progress: true` so an
  obsolete build cannot notify after a newer main build has started.
- Put notification in a job that `needs` every image/bundle publication job and
  uses a GitHub `production` environment.
- Read `DEPLOY_WEBHOOK_SECRET` from an environment/repository secret and call
  `https://webhook.incredibleplatform.com/deploy` with `github.sha`,
  `github.repository`, `github.ref`, `github.run_id` and
  `github.run_attempt`.
- Require HTTP 202; retry bounded transient network/5xx failures with backoff;
  treat 4xx responses as permanent workflow failure.
- Do not install a native repository push webhook for deployment.

### 6. Rollout, documentation and verification

Update `.env.example`, `README.md`, `docs/00-index.md` only if a new top-level
document/folder is added, and deployment/decision docs with:

- The `/home/services/mal` layout and ownership (`services` operator account,
  root-owned systemd units/scripts where required).
- GHCR read authentication and initial image SHA selection.
- `MAL_IMAGE_TAG`, `MAL_SANDBOX_IMAGE`, `MAL_RUNS_DIR`,
  `WEBHOOK_BASE_URL`, `DEPLOY_WEBHOOK_SECRET` and existing production secrets.
- Cloudflare DNS for `webhook.incredibleplatform.com`; the current scoped
  Zone:DNS:Edit ACME token remains sufficient.
- Initial bootstrap, manual deployment, automatic deployment, logs, queue
  inspection, retry, rollback and disaster-recovery commands.
- Database backup expectations and the explicit absence of automatic migration
  rollback.

Verification must include:

1. `pnpm typecheck` and `pnpm check`; only the already documented root
   `apps/frontend/app/root.tsx -> ./+types/root` issue may be handled through the
   frontend's own typegen-first typecheck.
2. All relevant unit/integration tests, including fresh database migration twice.
3. Local `linux/amd64` builds for every MAL-owned image and deployment bundle.
4. `docker compose -f docker-compose.prod.yml config` with production-like env.
5. Local routing smoke test for app frontend/API/internal denial plus the exact
   webhook host/path; wrong host/path must not reach the receiver.
6. Invalid HMAC, altered payload and replay tests proving no queue entry appears.
7. A deimos firewall test proving Traefik can reach frontend/server/receiver
   while a sandbox cannot reach proxy peers, Postgres/Redis, host services, LAN
   or another sandbox, and can still reach server ports 3000/3050 plus public
   internet.
8. A real main-branch build that publishes all SHA tags, queues exactly one
   deployment, migrates a fresh database, deploys successfully and survives a
   reboot.
9. Forced migration and health-check failures proving deployment state is not
   marked successful, logs are retained and the prior compatible app version
   remains/restores service.
10. A manual rollback exercise to `previous-sha`, explicitly confirming no
    reverse database migration occurs.

## Edge cases and failure handling

- **Notification before artifacts:** structurally prevent it with workflow job
  dependencies; the deployer still fails safely if any exact tag is missing.
- **Duplicate or replayed notification:** exclusive receipt creation returns
  409 and never creates a second queue entry.
- **Out-of-order workflows:** GitHub concurrency cancels obsolete builds and the
  host rejects run IDs not newer than `current-run-id`.
- **Receiver restart during write:** atomic rename means systemd sees either a
  complete request or no request.
- **Multiple queued requests:** one `flock` owner processes them; older requests
  may be archived as superseded only using numeric run ID, never filesystem
  lexical SHA ordering.
- **Receiver compromise:** it has the signing secret and can enqueue syntactically
  valid requests, but cannot access Docker or deployment secrets. The root
  deployer pulls only fixed GHCR repositories and treats all queue data as
  untrusted.
- **Migration failure:** do not switch the active release or start new app
  containers; archive failure and retain logs.
- **Migration succeeds, app fails:** attempt application/config rollback only if
  the previous version is declared compatible; never reverse the schema.
- **Firewall failure:** treat as deployment failure even if containers are
  healthy. Do not leave newly created sandboxes running with an unapplied policy.
- **Health timeout:** use bounded retries and explicit timeouts; avoid an
  indefinitely active systemd job.
- **Disk exhaustion:** fail before extraction using a free-space check and keep
  a bounded number of old release directories/images without deleting current
  or previous state.
- **GHCR unavailable:** leave the current release untouched and allow a later
  notification/operator retry.
- **Webhook secret rotation:** document a coordinated receiver-first/action-last
  rotation. Supporting two simultaneous secrets is optional and out of scope
  unless zero-gap rotation is required.
- **Fresh versus previously pushed database:** refuse an ambiguous baseline and
  require operator action; do not mark generated migrations as applied merely
  because tables happen to exist.

## Out of scope

- Kubernetes, Coolify or another deployment control plane.
- Multi-host scheduling or non-Docker sandbox runtimes.
- ARM or multi-architecture images; `deimos` is amd64.
- Pull-request preview environments.
- Automatic database rollback or arbitrary down migrations.
- Keeping the deployment webhook open until rollout completes.
- Reporting final deployment status to GitHub's Deployments/Checks API in v1.
- Allowing the public receiver to run commands, access Docker, or select image
  repositories.
- Automatic secret generation, Cloudflare DNS mutation, GHCR credential
  provisioning or host OS package installation.
- Replacing Traefik or changing the public MAL API policy beyond adding the
  isolated deployment hostname.

## Execution boundaries

Each frontmatter TODO is intentionally a separate implementation task/PR and
should be completed in order. At the end of each task, update its status,
document any interface introduced for the next task, run proportionate checks,
and use a plain commit summary without a conventional-commit prefix. Do not
batch all six TODOs into one agent context.
