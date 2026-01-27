# Scoped MCP Tool Use

## Current state

Whenever a new agent is spun up an `opencode.json` file is mounted to the agent container in OpenCode's user config directory. This config sets things like the model to use, but can have overrides set up by a specific project. One of the bits of configuration that is included in that file is the MCP server for My Agent Loop, which allows agents to perform some basic task manipulation.

If you look at `projects-mcp-handlers`, you'll see there's a hard-coded project id. This needs to be changed by a human when starting agents for a new project, which is obviously no good if I'm going to deploy this project anywhere.

## High level plan

Rather than give agents access to all projects, I'll instead automatically scope MCP calls to the appropriate project setting some custom headers per-agent container.

OpenCode's configuration for remote MCP servers includes a `headers` property, where we can add on extra headers. So instead of mounting the same config file for each and every run, let's generate a new, custom configuration each time.

Using the `@opencode-ai/sdk`, we'll construct a configuration object, write it to a file in the temporary directory we set up for the container. Within that configuration object, for the `my-agent-loop-tools` MCP server configuration, we'll add on a new header called `MAL_PROJECT_ID`, and populate that with the necessary `ProjectId`.

The config file is mounted within the `WorkflowExecutionService`, and so the new configuration file will need to either be created there, or somehow otherwise be passed to the execution service.

We'll then update the `projects-mcp-handlers` file to use that custom header, rejecting the request if it's not present.
