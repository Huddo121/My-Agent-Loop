import z from "zod";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTool, McpTools } from "../utils/mcp-tool";
import { withNewTransaction } from "../utils/transaction-context";

export const getCurrentProjectMcpHandler = {
  name: "Get current project",
  description: "Get the current project",
  parameters: z.object({}),
  execute: async (_params, { session }) => {
    const projectId = session?.projectId;

    if (projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }

    const services = getMcpServices();

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
