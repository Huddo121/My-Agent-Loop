import type { ProjectId } from "@mono/api";
import z from "zod";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTool, McpTools } from "../utils/mcp-tool";
import { withNewTransaction } from "../utils/transaction-context";

export const getCurrentProjectMcpHandler = {
  name: "Get current project",
  description: "Get the current project",
  parameters: z.object({}),
  execute: async () => {
    const services = getMcpServices();
    // TODO: Currently stubbing this out, need to get the project ID in to the MCP connections somehow
    const projectId = "019bf786-95b5-7bbb-bb57-25f0d87684bd" as ProjectId;

    const project = await withNewTransaction(
      services.db,
      async () => await services.projectsService.getProject(projectId),
    );

    if (project === undefined) {
      return JSON.stringify({
        error: "Project not found",
      });
    }

    return JSON.stringify(project);
  },
} satisfies McpTool;

export const projectsMcpTools = [getCurrentProjectMcpHandler] as McpTools;
