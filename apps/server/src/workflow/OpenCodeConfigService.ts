import type { ProjectId, TaskId } from "@mono/api";
import type { Auth, Config, McpRemoteConfig } from "@opencode-ai/sdk";
import type { ModelProviderService } from "../providers/ModelProviderServices";

export const MAL_PROJECT_ID_HEADER = "X-MAL-Project-ID";
export const MAL_TASK_ID_HEADER = "X-MAL-Task-ID";

/**
 * The configuration for the OpenCode authentication.
 * If you connect to a provider (e.g. OpenRouter), your auth config is stored in a file
 *   at `~/.local/share/opencode/auth.json`.
 */
type AuthConfig = Record<string, Auth>;

/**
 * Base configuration for OpenCode that is shared across all agent containers.
 * This is the configuration that would have been in the static opencode.json file.
 *
 * Note: The permission field uses `"*": "allow"` which is a runtime feature of OpenCode
 * that allows all permissions by default, but is not reflected in the SDK types.
 */
const baseConfig: Config = {
  $schema: "https://opencode.ai/config.json",
  provider: {
    ollama: {
      options: {
        baseURL: "http://host.docker.internal:11434/v1",
      },
      models: {
        "devstral-small-2": {
          name: "Devstral Small 2",
          tool_call: true,
          reasoning: true,
        },
      },
    },
  },
  permission: {
    // The "*" wildcard allows all permissions - this is a runtime feature not typed in the SDK
    "*": "allow",
  } as Config["permission"],
  model: "opencode/big-pickle",
};

/**
 * Generates OpenCode configuration objects for agent containers, scoping MCP tool access to a specific project and task.
 */
export class OpenCodeConfigService {
  constructor(private readonly modelProviderService: ModelProviderService) {}

  /**
   * Generates OpenCode configuration.
   *
   * @param projectId The project ID to scope MCP tool access to
   * @param taskId The task ID to scope MCP tool access to
   * @returns The OpenCode configuration object
   */
  generateConfig(projectId: ProjectId, taskId: TaskId): Config {
    const mcpServerConfig: McpRemoteConfig = {
      enabled: true,
      type: "remote",
      url: "http://host.docker.internal:3050/mcp",
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
      model: this.selectModel(),
    };
  }

  /**
   * Generates the OpenCode authentication configuration for the available providers.
   * @returns The OpenCode authentication configuration
   */
  generateAuthConfig(): AuthConfig {
    const configuredProviders = this.modelProviderService.authConfig;
    return Object.entries(configuredProviders).reduce(
      (acc, [provider, value]) => {
        const auth: Auth = { type: "api", key: value.getSecretValue() };
        return Object.assign(acc, {
          [provider]: auth,
        });
      },
      {},
    );
  }

  private selectModel(): string {
    const availableProviders =
      this.modelProviderService.getAvailableProviders();

    if (availableProviders.includes("openrouter")) {
      return "openrouter/qwen/qwen3-coder:free";
    }

    return "opencode/big-pickle";
  }
}
