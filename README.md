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

MAL deploys to the homelab host `deimos` from prebuilt, SHA-tagged GHCR images,
behind the host's shared Traefik. GitHub Actions builds and publishes the images,
then calls a deploy webhook that pulls the new SHA and rolls the Compose project.
MAL does not run its own reverse proxy — it publishes loopback ports and
contributes a routes file to the shared Traefik.

See **[docs/06-deimos-deployment.md](docs/06-deimos-deployment.md)** for the full
operator runbook (host setup, registry login, env files, Traefik route, webhook
hook, and the update/rollback flow). The installable templates live under
[`deploy/`](deploy/).
