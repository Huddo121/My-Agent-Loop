# Concepts

**NB:** Not everything mentioned here is fully implemented

## Project

A Project is a container for tasks, and includes some configuration for how agents will interact with those tasks (the [Workflow](#workflow)).

The Project should also be the home for configuration that applies to all the tasks, like what remote repo houses the code being worked on, and what custom base image to use.

## Run

> [!CAUTION]
> These aren't *really* implemented yet, but their ids are used to scope volume mounts for the agent containers

A run is a single instance of a sandbox being spun up, set up, and the coding agent being run. A single task might require multiple runs, as the agent might fail in its task, or not pass a review step of a workflow.

## Task queue

This is the ordered list of tasks that need to be completed by agents. Tasks themselves are pretty simple, just being a title and a description, with some metadata for tracking their progress through the queue.

## Workflow

A Workflow is the configuration governing how tasks are processed. This might include things like whether code is merged directly to the main branch, or if there are some verification commands that need to be run in a container before accepting the work as complete.
