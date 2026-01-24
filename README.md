# My Agent Loop

> [!CAUTION]
> This project isn't actually ready to be used, there's still some jank in how it is run, but it's good enough (with some setup) to have the loop improve itself.
> In many ways this is just my playground for getting more comfortable with heavier use of agents during development.

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
