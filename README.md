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
mkdir -p /srv/my-agent-loop/runs
chmod 700 /srv/my-agent-loop/runs
```

Required values are `APP_BASE_URL`, `MCP_SERVER_URL`,
`DRIVER_HOST_API_BASE_URL`, `MAL_RUNS_DIR`, `POSTGRES_PASSWORD`,
`BETTER_AUTH_SECRET`, `FORGE_ENCRYPTION_KEY`,
`OAUTH_CREDENTIALS_ENCRYPTION_KEY`, `ACME_EMAIL`, and `CF_DNS_API_TOKEN`.
Keep the two encryption keys distinct. The example uses service DNS for MCP and
driver-host traffic; do not replace those production URLs with
`host.docker.internal`.

### Build and start

Production Dockerfiles package prebuilt artifacts; they do not compile source.
From the repository root:

```bash
pnpm install --frozen-lockfile

# The server image copies a production pnpm deploy bundle.
pnpm --filter @mono/server build
rm -rf apps/server/deploy
pnpm --filter=@mono/server deploy --prod --legacy apps/server/deploy

# The frontend image copies the static SPA output.
pnpm --filter @mono/frontend build

# Sandboxes are created from this separate host image through docker.sock.
pnpm docker:build

docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d my-agent-loop-db my-agent-loop-redis
```

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
