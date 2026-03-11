import type {
  AgentHarness,
  AgentHarnessPreparation,
  HarnessModel,
  HarnessPreparationContext,
} from "./AgentHarness";
import { MAL_PROJECT_ID_HEADER, MAL_TASK_ID_HEADER } from "./OpenCodeHarness";

const CODEX_CONFIG_PATH = "/root/.codex/config.toml";

/** Env var names Codex will read for MCP request headers (see env_http_headers in config.toml). */
const ENV_VAR_PROJECT_ID = "MAL_PROJECT_ID";
const ENV_VAR_TASK_ID = "MAL_TASK_ID";

/**
 * Escape a string for use inside a TOML double-quoted value.
 * See https://toml.io/en/v1.0.0#string
 */
function escapeTomlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Codex CLI harness: config at ~/.codex/config.toml (MCP via Streamable HTTP),
 * OPENAI_API_KEY from env. Run command references /task.txt which is mounted by the workflow.
 */
export class CodexCliHarness implements AgentHarness {
  readonly id = "codex-cli" as const;
  readonly displayName = "Codex CLI";
  readonly models: readonly HarnessModel[] = [
    { id: "gpt-5.4", displayName: "GPT-5.4" },
    { id: "gpt-5.3-codex-spark", displayName: "Codex Spark" },
    { id: "o3", displayName: "o3" },
  ];

  prepare(context: HarnessPreparationContext): AgentHarnessPreparation {
    const configToml = this.buildConfigToml(context.mcpServerUrl);
    const env: Record<string, string> = {
      [ENV_VAR_PROJECT_ID]: context.projectId,
      [ENV_VAR_TASK_ID]: context.taskId,
    };
    if (context.credentials !== undefined) {
      env.OPENAI_API_KEY = context.credentials.getSecretValue();
    }

    return {
      files: [
        {
          containerPath: CODEX_CONFIG_PATH,
          contents: configToml,
        },
      ],
      setupCommands: [],
      runCommand: this.getRunCommand(context.modelId),
      env,
    };
  }

  private buildConfigToml(mcpServerUrl: string): string {
    // Codex Streamable HTTP MCP: url + env_http_headers (header name -> env var name).
    // Container env MAL_PROJECT_ID / MAL_TASK_ID are sent as X-MAL-Project-ID / X-MAL-Task-ID.
    const url = escapeTomlString(mcpServerUrl);
    return `[mcp_servers."my-agent-loop-tools"]
url = "${url}"
env_http_headers = { "${MAL_PROJECT_ID_HEADER}" = "${ENV_VAR_PROJECT_ID}", "${MAL_TASK_ID_HEADER}" = "${ENV_VAR_TASK_ID}" }
`;
  }

  private getRunCommand(modelId: string | null): string {
    const base =
      'codex exec "Read the task description in the file /task.txt (at the root of the filesystem) and complete the task within the file. If there is an AGENTS.md file in the current directory, ensure you read it and follow its instructions closely."';
    if (modelId === null) {
      return base;
    }
    return `${base} --model ${modelId}`;
  }
}
