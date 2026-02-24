import type { ProjectId } from "@mono/api";
import type { Context, Tool, ToolParameters } from "fastmcp";
import type { McpSessionData } from "../mcp";

export type McpTool<T extends ToolParameters = ToolParameters> = Tool<
  McpSessionData,
  T
>;

/**
 * For a list of MCP tools, when calling `fastmcp`'s `addTools` method you have to provide
 *   a list of tools that all have the same parameters type. That's annoying, and useless,
 *   so this type helper will forget the information that normally causes a type error.
 */
export type McpTools = McpTool<ToolParameters>[];

/** Standard error JSON when X-MAL-Project-ID is missing. Single source of truth for message and shape. */
export const PROJECT_ID_REQUIRED_ERROR_JSON = JSON.stringify({
  error: "Project ID not provided. X-MAL-Project-ID header is required.",
});

/**
 * Tool definition for handlers that require a project context. The inner `execute` receives
 * the resolved `projectId` so it does not need to check or repeat the error message.
 */
export type ProjectScopedTool<P extends ToolParameters = ToolParameters> = {
  name: string;
  description?: string;
  parameters?: P;
  execute: (
    args: unknown,
    context: Context<McpSessionData>,
    projectId: ProjectId,
  ) => ReturnType<McpTool<P>["execute"]>;
};

/**
 * Wraps a project-scoped tool so that X-MAL-Project-ID is checked once before execute.
 * Use this instead of duplicating the same check in every handler.
 * Returns McpTool (not McpTool<P>) so the result is assignable to McpTools arrays.
 */
export function withRequiredProjectId<P extends ToolParameters>(
  tool: ProjectScopedTool<P>,
): McpTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args: unknown, context) => {
      const projectId = context.session?.projectId;
      if (projectId === undefined) {
        console.error(
          "Project ID not provided. X-MAL-Project-ID header is required.",
          { session: context.session },
        );
        return PROJECT_ID_REQUIRED_ERROR_JSON;
      }
      return tool.execute(args, context, projectId);
    },
  };
}
