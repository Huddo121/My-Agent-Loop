# My Agent Loop

> [!CAUTION]
> This project isn't actually ready to be used, there's still some jank in how it is run, but it's good enough (with some setup) to have the loop improve itself.
> In many ways this is just my playground for getting more comfortable with heavier use of agents during development.
> For more serious projects you should consider [Vibe-Kanban](https://www.vibekanban.com/), [Auto-Claude](https://github.com/AndyMik90/Auto-Claude), or [Automaker](https://automaker.app/)

Tool that will repeatedly call an LLM, letting it work on a sandboxed instance of a codebase in order to complete a series of tasks.

## Quickstart

### Requirements

- Docker
- PNPM
- Nodejs

### Starting the app

```bash
pnpm docker:build     # Build a local copy of the my-agent-loop agent container
pnpm install          # Download all of the project's dependencies
docker compose up -d  # Start any runtime dependencies
pnpm dev              # Start all the dev processes
```

## Production deployment

The production stack targets a Docker-only Linux host. Traefik is the sole
public ingress: it serves the SPA on `/`, forwards `/api*` to the server, and
rejects `/api/internal` and `/api/internal/*`. Postgres, Redis, the MCP listener,
and sandbox containers publish no host ports.

### Host and DNS prerequisites

1. Forward TCP ports 80 and 443 from the internet router to `deimos`. Do not
   forward 3000, 3050, 5432, or 6379.
2. In Cloudflare, create an apex `A` record pointing to the homelab public IP.
   It can remain DNS-only initially; Cloudflare proxying is optional because
   certificate issuance uses DNS-01. A wildcard sandbox record is deliberately
   deferred until dynamic sandbox routing exists.
3. Create a Cloudflare API token from the **Edit zone DNS** template, or grant
   only `Zone:DNS:Edit` for this zone. Do not use the Global API Key.
4. Install Node 24, pnpm 10, Docker Engine with Compose v2, and iptables on
   `deimos`. The Docker daemon must be available at `/var/run/docker.sock`.

Create the production environment file and replace every placeholder:

```bash
cp .env.example .env
mkdir -p /home/services/mal/runs
chmod 700 /home/services/mal/runs
```

Required values are `MAL_IMAGE_TAG`, `APP_BASE_URL`, `MCP_SERVER_URL`,
`DRIVER_HOST_API_BASE_URL`, `MAL_RUNS_DIR`, `POSTGRES_PASSWORD`,
`BETTER_AUTH_SECRET`, `FORGE_ENCRYPTION_KEY`,
`OAUTH_CREDENTIALS_ENCRYPTION_KEY`, `ACME_EMAIL`, and `CF_DNS_API_TOKEN`.
Keep the two encryption keys distinct. The example uses service DNS for MCP and
driver-host traffic; do not replace those production URLs with
`host.docker.internal`.

### Deploy (pull prebuilt images)

The host runs immutable images pulled from GHCR; it never builds from source.
The `Publish production` workflow builds linux/amd64 images tagged with the
commit SHA. Set `MAL_IMAGE_TAG` in `.env` to that SHA, then pull and start the
datastores:

```bash
docker compose -f docker-compose.prod.yml config   # validates required env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d my-agent-loop-db my-agent-loop-redis
```

The server creates agent sandboxes from `MAL_SANDBOX_IMAGE`, which the compose
file pins to the same SHA. VM sandboxes additionally need the rootfs and kernel
from `my-agent-loop-sandbox-vm:<sha>` extracted into the host VM cache directory
that `VM_ROOTFS_PATH` / `VM_KERNEL_PATH` point at.

<details>
<summary>Local smoke test without GHCR</summary>

To exercise the production compose against locally built images, build and tag
the image refs and point `MAL_IMAGE_TAG` at that tag (then skip `pull`):

```bash
pnpm install --frozen-lockfile
export MAL_IMAGE_TAG=local

# Server: packaging-only image over a prepared pnpm deploy bundle.
pnpm --filter @mono/server build
rm -rf apps/server/deploy
pnpm --filter=@mono/server deploy --prod --legacy apps/server/deploy
docker build -f apps/server/Dockerfile \
  -t ghcr.io/huddo121/my-agent-loop-server:local apps/server/deploy

# Frontend: static SPA over nginx.
pnpm --filter @mono/frontend build
docker build -t ghcr.io/huddo121/my-agent-loop-frontend:local apps/frontend

# Docker sandbox image (prebuilt Linux driver first).
pnpm driver:build:linux
docker build -t ghcr.io/huddo121/my-agent-loop-sandbox:local .
```

</details>

Apply the committed migrations before starting the server. The one-shot
`migrate` service runs inside the private `app-net` using the same server image
(it bundles the migrations), so Postgres never needs to be exposed and the host
needs no Drizzle tooling or socat tunnel. It is gated behind the `tools` profile,
so a plain `up` never reruns it:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate

docker compose -f docker-compose.prod.yml up -d
sudo ./scripts/configure-production-firewall.sh
```

Migrations are forward-only and follow an expand/contract policy; see
[the production migrations decision](docs/decisions/production-migrations.md). A
database created earlier with `drizzle-kit push` needs an explicit one-time
baseline before the first migration — do not run the migrator blindly against it.

The firewall script must be reapplied whenever Compose recreates the server;
[the production firewall guide](docs/05-production-firewall.md) includes a
systemd unit for reboot persistence. After deployment, verify the public host
exposes only ports 80 and 443 and that `/api/internal/anything` returns 403.
