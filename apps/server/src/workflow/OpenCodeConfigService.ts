import fs from "node:fs";
import type { ProjectId } from "@mono/api";
import type { Config, McpRemoteConfig } from "@opencode-ai/sdk";
import type { AbsoluteFilePath } from "../file-system/FilePath";

export const MAL_PROJECT_ID_HEADER = "X-MAL-Project-ID";

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
 * Generates OpenCode configuration files for agent containers, scoping MCP tool access to a specific project.
 */
export class OpenCodeConfigService {
  /**
   * Generates a project-scoped OpenCode configuration and writes it to a file.
   *
   * @param projectId The project ID to scope MCP tool access to
   * @param targetPath The path where the configuration file should be written
   * @returns The path to the generated configuration file
   */
  generateConfig(projectId: ProjectId, targetPath: AbsoluteFilePath): void {
    const mcpServerConfig: McpRemoteConfig = {
      enabled: true,
      type: "remote",
      url: "http://host.docker.internal:3050/mcp",
      headers: {
        [MAL_PROJECT_ID_HEADER]: projectId,
      },
    };

    const config: Config = {
      ...baseConfig,
      mcp: {
        "my-agent-loop-tools": mcpServerConfig,
      },
    };

    fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));
  }
}
