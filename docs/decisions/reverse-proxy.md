# Decision: Production ingress and container isolation

## Context

My Agent Loop needs one public HTTPS ingress for its SPA and API while keeping
the driver-host API private. The server runs in Docker and creates agent sandbox
containers through the host Docker socket. Those containers need internet
egress and two server endpoints, but must not reach application datastores or
other host services.

The repository uses bundler-style TypeScript module resolution. Development's
`tsx` runtime hides extensionless ESM imports that plain Node cannot execute from
raw `tsc` output. Fully bundling third-party dependencies is also unsuitable:
`dockerode` reaches native `ssh2`/`cpu-features` addons and some dependencies use
optional dynamic imports.

## Decision

Traefik is the only service publishing host ports 80 and 443. Its file provider
defines three routers: the exact `/api/internal` path and its descendants have
highest priority and an IP allowlist containing loopback only; all other
`/api*` requests go to the server; the lowest-priority router sends everything
else to the static frontend. The policy intentionally maintains one denial
rather than an allowlist of public endpoints, so new server routes are public by
default. Administrative API endpoints are deliberately public for now.

Traefik uses one Let's Encrypt resolver with Cloudflare DNS-01 from the first
deployment. The credential is a zone-scoped `Zone:DNS:Edit` token, never the
Cloudflare Global API Key. DNS-01 keeps certificate issuance independent of
Cloudflare proxy mode and avoids changing challenge mechanisms if dynamic
sandbox hostnames require wildcard certificates later.

Traefik was selected over Caddy. Both can serve today's static routes, but
Traefik's file configuration provides a direct path to server-generated dynamic
routing without Docker labels or custom proxy plugins. A future sandbox routing
feature can publish runtime-independent route data; no such routing is included
in this deployment. The production runtime remains Docker-only.

The stack has an internal `app-net` for the server, Postgres, and Redis, plus
`mal-sandbox-net` for the server, ingress/frontend, and dynamically created
sandboxes. Postgres and Redis have no published ports and never join the sandbox
network. Host `DOCKER-USER` and `INPUT` rules narrow sandbox access further to
the server's ports 3000 and 3050 plus public internet egress.

`MAL_RUNS_DIR` is an absolute host directory mounted into the server container
at the identical path. This alignment is required because the containerised
server asks the host Docker daemon to create sandbox bind mounts; host Docker
resolves source paths in the host filesystem, not the server container.

The server build therefore uses esbuild to bundle only the first-party graph
(`@mono/server`, `@mono/api`, and `@mono/driver-api`) into runnable ESM. Real
dependencies remain external and are installed by `pnpm deploy --prod
--legacy`. The production Dockerfile only copies that prepared artifact into a
Node runtime image.

## Alternatives considered

- Caddy's admin API could accept dynamic routes, but would couple the server to
  imperative proxy mutation. Custom discovery would require rebuilding Caddy
  with plugins.
- Traefik's Docker provider and labels were rejected because the server creates
  short-lived containers imperatively and the proxy should consume routing
  intent rather than Docker runtime details.
- Traefik's Redis KV provider offers fast updates, but exposes a
  version-specific key schema and makes routing depend on Redis health.
- A watched shared file would require a shared writable volume and careful
  atomic replacement. It offers no benefit over an internal HTTP configuration
  endpoint for the expected update rate.

## Consequences

- Operators must configure apex DNS, a scoped Cloudflare token, and host
  forwarding for ports 80 and 443.
- Requests to `/api/internal` and `/api/internal/*` receive 403 at ingress;
  `/api/internalish` remains part of the public API surface.
- The host firewall script must run after server container recreation because
  it discovers and allowlists the live server address.
- Production images require host-side build/package steps before Docker build.
