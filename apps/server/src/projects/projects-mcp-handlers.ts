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
      console.error(
        "Project ID not provided. X-MAL-Project-ID header is required.",
        { session },
      );
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
      console.error("Can not get current project, project not found", {
        projectId,
        session,
      });
      return JSON.stringify({
        error: "Project not found",
      });
    }

    console.info("Returning current project", { project });
    return JSON.stringify(project);
  },
} satisfies McpTool;

export const projectsMcpTools = [getCurrentProjectMcpHandler] as McpTools;
