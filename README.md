# My Agent Loop

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

## Concepts

### Task Queue

The task queue is the list of tasks that need to be completed in order for a project to achieve its goals.
Each task will result in a new instantiation of a sandbox, which will allow an agent to complete the task autonomously.
Agents can emit new tasks for later completion.

### Sandbox

A docker container that has access to everything needed to build and run the project being worked on.
At startup, the sandbox will have the git repo for the project checked out and mounted as a volume.

