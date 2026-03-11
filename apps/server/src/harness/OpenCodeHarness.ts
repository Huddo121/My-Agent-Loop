import type { ProjectId, TaskId } from "@mono/api";
import type { Auth, Config, McpRemoteConfig } from "@opencode-ai/sdk";
import type {
  AgentHarness,
  AgentHarnessPreparation,
  HarnessModel,
  HarnessPreparationContext,
} from "./AgentHarness";

export const MAL_PROJECT_ID_HEADER = "X-MAL-Project-ID";
export const MAL_TASK_ID_HEADER = "X-MAL-Task-ID";

const baseConfig: Config = {
  $schema: "https://opencode.ai/config.json",
  // TODO:One day I should come back to this, using local models might allow for some fun "free" loops
  // provider: {
  //   ollama: {
  //     options: {
  //       baseURL: "http://host.docker.internal:11434/v1",
  //     },
  //     models: {
  //       "devstral-small-2": {
  //         name: "Devstral Small 2",
  //         tool_call: true,
  //         reasoning: true,
  //       },
  //       "glm-4.7-flash": {
  //         name: "GLM 4.7 Flash",
  //         tool_call: true,
  //         reasoning: true,
  //       },
  //     },
  //   },
  // },
  permission: {
    "*": "allow",
  } as Config["permission"],
  model: "opencode/big-pickle",
};

/**
 * OpenCode harness: config file + auth file, no setup commands (MCP is in config).
 * Run command references /task.txt which is mounted by the workflow.
 */
export class OpenCodeHarness implements AgentHarness {
  readonly id = "opencode" as const;
  readonly displayName = "OpenCode";
  readonly models: readonly HarnessModel[] = [
    { id: "opencode/big-pickle", displayName: "Big Pickle (Free)" },
    { id: "opencode/minimax-m2.5-free", displayName: "MiniMax M2.5 (Free)" },
  ];

  prepare(context: HarnessPreparationContext): AgentHarnessPreparation {
    const config = this.buildConfig(
      context.projectId,
      context.taskId,
      context.mcpServerUrl,
      context.modelId,
    );
    const authConfig = this.buildAuthConfig(context.credentials);

    return {
      files: [
        {
          containerPath: "/root/.config/opencode/opencode.json",
          contents: JSON.stringify(config, null, 2),
        },
        {
          containerPath: "/root/.local/share/opencode/auth.json",
          contents: JSON.stringify(authConfig, null, 2),
        },
      ],
      setupCommands: [],
      runCommand:
        'opencode run "Read the task description in the file /task.txt (at the root of the filesystem) and complete the task within the file. If there is an AGENTS.md file in the current directory, ensure you read it and follow its instructions closely."',
    };
  }

  private buildConfig(
    projectId: ProjectId,
    taskId: TaskId,
    mcpServerUrl: string,
    modelId: string | null,
  ): Config {
    const mcpServerConfig: McpRemoteConfig = {
      enabled: true,
      type: "remote",
      url: mcpServerUrl,
      headers: {
        [MAL_PROJECT_ID_HEADER]: projectId,
        [MAL_TASK_ID_HEADER]: taskId,
      },
    };
    return {
      ...baseConfig,
      mcp: {
        "my-agent-loop-tools": mcpServerConfig,
      },
      model: modelId ?? this.defaultModelId(),
    };
  }

  private buildAuthConfig(
    credentials: HarnessPreparationContext["credentials"],
  ): Record<string, Auth> {
    if (credentials === undefined) {
      return {};
    }
    return {
      openrouter: { type: "api", key: credentials.getSecretValue() },
    };
  }

  private defaultModelId(): string {
    return "opencode/minimax-m2.5-free";
  }
}
