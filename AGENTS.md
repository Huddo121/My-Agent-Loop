# Notes for AI Agents

Review the `docs` directory to understand some of the specifics of this project.

## Specific guidance for AI Agents

- Don't generate or modify configuration if a tool can do it for you
  - E.g. don't modify package.json to add a dependency, use a `pnpm` command to do it
- If you modify the documentation, be sure to update the `00-index.md` if necessary
- Run the `typecheck` and `check` scripts in `package.json` before finishing your task, and endeavour to resolve all found issues.
- When completing a task, aim to complete the task and don't try to do too much beyond what was asked of you unless it is strictly required to complete your objective
- If you wish to introduce a new pattern or technology to the codebase, be sure to document it in the `docs/decisions` folder in a markdown file
- Leverage the `webfetch` tool to get the latest information on things, or to review the documentation of libraries and tools you're using.
  - Repeat the important parts of what you find when you do so
