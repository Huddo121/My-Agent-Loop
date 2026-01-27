import type { Tool, ToolParameters } from "fastmcp";
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
