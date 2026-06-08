import z from "zod";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTools } from "../utils/mcp-tool";
import { withRequiredProjectId } from "../utils/mcp-tool";
import { withNewTransaction } from "../utils/transaction-context";

export const getSandboxTypeMcpHandler = withRequiredProjectId({
  name: "Get sandbox type",
  description:
    "Get the effective sandbox type for the current project, resolving project → workspace → default ('docker').",
  parameters: z.object({}),
  execute: async (_params, _context, projectId) => {
    const services = getMcpServices();

    const project = await withNewTransaction(
      services.db,
      async () => await services.projectsService.getProject(projectId),
    );

    if (project === undefined) {
      console.error("Can not get sandbox type, project not found", {
        projectId,
      });
      return JSON.stringify({ error: "Project not found" });
    }

    const sandboxType = await withNewTransaction(
      services.db,
      async () =>
        await services.sandboxTypeConfigRepository.resolveSandboxType(
          projectId,
          project.workspaceId,
        ),
    );

    console.info("Returning resolved sandbox type", { projectId, sandboxType });
    return JSON.stringify({ sandboxType });
  },
});

export const sandboxMcpTools = [getSandboxTypeMcpHandler] as McpTools;
