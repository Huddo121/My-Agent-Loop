# TODO

## Smaller features

- [X] Actually use the Projects and Runs APIs/Models
- [ ] Use AsyncLocalStorage to add some logging context, create new contexts for each task
- [ ] Refactor SandboxService to lean more on reusable helpers than it currently does
- [ ] Update all service methods to return Result types with typed failures other than Error
- [ ] Add startup checks for things like Docker socket being usable, git existing, etc
- [ ] Record each run of the workflow, its state, and the logs associated with the run
- [ ] Allow a choice of model per-task
- [X] See if Opus can generate a PromiseEither<E, A> class which can be used with async/await (NB: It did not do a good job here)
- [ ] Allow agents to interrogate the task queue and add new tasks
- [ ] Add ability to use custom base container for the agent
- [ ] Be a little better about not using API types throughout the application (e.g. TaskId, ProjectId)
- [ ] Clean up old checkouts
- [ ] Clean up pending runs that are too old
- [ ] Surface run state to the frontend (and actually track it somewhere usable)
- [ ] Streamed results for task updates
- [ ] Add other agent runtimes (Claude Code, Cursor CLI)
- [ ] Split the create/update dialogs for tasks and projects, or at least wrap them with create/update wrappers to improve typesafety (i.e. remove optional fields from the 'update' variant)
- [ ] Add sonner for error signaling when request fail
- [ ] Give TsGo a try, it might make the typecheck loop in watch mode more enjoyable
- [ ] Add a command palette

## Big features

- [ ] Figure out a better strategy for handling authenticated processes (e.g. Git, Docker)
- [ ] Add a verification step at the end of a task
- [ ] Add the ability for agents to ask for input from a human or other agent
- [ ] Add a management and orchestrator agent
- [ ] Change the task system to be a graph
- [ ] Create a 'Project' concept which groups together tasks, and workflow config (e.g. repo)
- [ ] Keep track of tasks and runs, and their logs, in a DB
- [ ] Add ability to watch a directory for file changes, so I can stream file changes to a frontend
