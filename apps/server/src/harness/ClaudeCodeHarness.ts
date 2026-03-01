import type {
  AgentHarness,
  AgentHarnessPreparation,
  HarnessPreparationContext,
} from "./AgentHarness";

/** Env var names for MCP setup script (headers sent to MCP server). */
const ENV_VAR_PROJECT_ID = "MAL_PROJECT_ID";
const ENV_VAR_TASK_ID = "MAL_TASK_ID";
const ENV_VAR_MCP_SERVER_URL = "MCP_SERVER_URL";

const MCP_SERVER_NAME = "my-agent-loop-tools";

/** Shell variable expansion prefix written into harness-setup.sh so the container expands it. */
const SHELL_VAR = "$";

/**
 * Claude Code harness: MCP via `claude mcp add --transport http` in setupCommands,
 * ANTHROPIC_API_KEY from env. Run command uses -p with --allowedTools "*".
 */
export class ClaudeCodeHarness implements AgentHarness {
  readonly id = "claude-code" as const;
  readonly displayName = "Claude Code";

  prepare(context: HarnessPreparationContext): AgentHarnessPreparation {
    const env: Record<string, string> = {
      [ENV_VAR_PROJECT_ID]: context.projectId,
      [ENV_VAR_TASK_ID]: context.taskId,
      [ENV_VAR_MCP_SERVER_URL]: context.mcpServerUrl,
    };
    if (context.credentials !== undefined) {
      env.ANTHROPIC_API_KEY = context.credentials.getSecretValue();
    }

    const setupCommands = [
      `claude mcp add --transport http --header "X-MAL-Project-ID: ${SHELL_VAR}${ENV_VAR_PROJECT_ID}" --header "X-MAL-Task-ID: ${SHELL_VAR}${ENV_VAR_TASK_ID}" ${MCP_SERVER_NAME} "${SHELL_VAR}${ENV_VAR_MCP_SERVER_URL}"`,
    ];

    return {
      files: [],
      setupCommands,
      runCommand:
        'claude -p "Read the task description in the file /task.txt (at the root of the filesystem) and complete the task within the file. If there is an AGENTS.md file in the current directory, ensure you read it and follow its instructions closely." --allowedTools "*"',
      env,
    };
  }
}
