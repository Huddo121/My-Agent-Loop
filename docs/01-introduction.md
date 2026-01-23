# Introduction

## Tech Stack

This is a Typescript monorepo, using PNPM workspaces, and Moonrepo for some task execution and to keep the Typescript project references synchronised.

## High level workflow

At its core, My Agent Loop is a simple message processor that takes messages from a queue, and feeds them to an AI Agent running inside a docker container.

1. Task queue is checked to see what the highest priority available task is
2. That Task is picked up for execution, a temporary directory is created to house everything needed to complete the task
  a. The Task is saved to a file, `task.txt`
  b. The repo the task is for is checked out to the temporary directory in `/code`, and it's checked out to a new branch with a random suffix
  c. The baseline configuration for `opencode` is created
3. All of the necessary files/folders from step 2 are mounted to a newly started instance of the `my-agent-loop` container
4. If the repo has a `.agent-loop/setup.sh` script, it's executed
5. `opencode` is run and the agent is informed they need to complete the task inside the `/task.txt` file
6. (Hopefully) the agent completes the task as specified
7. If the repo has a `.agent-loop/teradown.sh` script, it's executed
8. The task is marked as completed, the code from that run is committed, pushed, and merged to the main branch
9. Repeat from step 1 until the queue is empty

## Repo layout

### `apps/*`

These are independently deployable and runnable applications.
Any dependencies within the monorepo should be added using the `"workspace:*"` version, which PNPM will do for you.

### `packages/*`

These are reusable libraries. Apps and other Packages can depend on them.

### `.agent-loop`

Scripts related to my-agent-loop, these will be run inside the `my-agent-loop` Agent container.
The `setup.sh` and `teardown.sh` scripts are called at the start and end of the agent container's lifecycle respectively. `setup.sh` sets up the container with all of the project-specific stuff needed to develop this project.
