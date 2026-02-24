import z from "zod";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTools } from "../utils/mcp-tool";
import { withRequiredProjectId } from "../utils/mcp-tool";
import { withNewTransaction } from "../utils/transaction-context";

export const getCurrentProjectMcpHandler = withRequiredProjectId({
  name: "Get current project",
  description: "Get the current project",
  parameters: z.object({}),
  execute: async (_params, _context, projectId) => {
    const services = getMcpServices();

    const project = await withNewTransaction(
      services.db,
      async () => await services.projectsService.getProject(projectId),
    );

    if (project === undefined) {
      console.error("Can not get current project, project not found", {
        projectId,
      });
      return JSON.stringify({
        error: "Project not found",
      });
    }

    console.info("Returning current project", { project });
    return JSON.stringify(project);
  },
});

export const projectsMcpTools = [getCurrentProjectMcpHandler] as McpTools;
