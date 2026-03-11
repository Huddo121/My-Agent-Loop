import type {
  AgentHarness,
  AgentHarnessPreparation,
  HarnessModel,
  HarnessPreparationContext,
} from "./AgentHarness";
import { MAL_PROJECT_ID_HEADER, MAL_TASK_ID_HEADER } from "./OpenCodeHarness";

const MCP_JSON_PATH = "/root/.cursor/mcp.json";
const MCP_SERVER_NAME = "my-agent-loop-tools";

const TASK_PROMPT =
  "Read the task description in the file /task.txt (at the root of the filesystem) and complete the task within the file. If there is an AGENTS.md file in the current directory, ensure you read it and follow its instructions closely.";

/**
 * Cursor CLI harness: MCP via .cursor/mcp.json (streamable HTTP),
 * CURSOR_API_KEY from env. Run command uses agent -p --force for non-interactive execution.
 */
export class CursorCliHarness implements AgentHarness {
  readonly id = "cursor-cli" as const;
  readonly displayName = "Cursor CLI";
  readonly models: readonly HarnessModel[] = [
    { id: "claude-4.6-sonnet", displayName: "Claude 4.6 Sonnet" },
    { id: "gemini-3-pro", displayName: "Gemini 3 Pro" },
    { id: "composer-1.5", displayName: "Composer 1.5" },
  ];

  prepare(context: HarnessPreparationContext): AgentHarnessPreparation {
    const mcpJson = this.buildMcpJson(
      context.mcpServerUrl,
      context.projectId,
      context.taskId,
    );
    const env: Record<string, string> = {};
    if (context.credentials !== undefined) {
      env.CURSOR_API_KEY = context.credentials.getSecretValue();
    }

    const modelFlag =
      context.modelId !== null ? ` --model ${context.modelId}` : "";

    return {
      files: [
        {
          containerPath: MCP_JSON_PATH,
          contents: mcpJson,
        },
      ],
      setupCommands: [],
      runCommand: `agent -p --force "${TASK_PROMPT}"${modelFlag}`,
      env: Object.keys(env).length > 0 ? env : undefined,
    };
  }

  private buildMcpJson(
    mcpServerUrl: string,
    projectId: string,
    taskId: string,
  ): string {
    const config = {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          url: mcpServerUrl,
          headers: {
            [MAL_PROJECT_ID_HEADER]: projectId,
            [MAL_TASK_ID_HEADER]: taskId,
          },
        },
      },
    };
    return JSON.stringify(config, null, 2);
  }
}
