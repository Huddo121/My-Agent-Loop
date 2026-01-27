import type { ProjectId, TaskId } from "@mono/api";
import { FastMCP } from "fastmcp";
import { projectsMcpTools } from "./projects/projects-mcp-handlers";
import type { Services } from "./services";
import { tasksMcpTools } from "./tasks/tasks-mcp-handlers";
import { withMcpServices } from "./utils/mcp-service-context";
import {
  MAL_PROJECT_ID_HEADER,
  MAL_TASK_ID_HEADER,
} from "./workflow/OpenCodeConfigService";

export interface McpSessionData {
  projectId: ProjectId | undefined;
  taskId: TaskId | undefined;
  [key: string]: unknown;
}

const mcpServer = new FastMCP<McpSessionData>({
  name: "My Agent Loop",
  version: "0.0.1",
  // FastMCP just kept logging heaps of uses messages about not being able to infer client capabilities during runs,
  //   so I've silenced these logs. I look forward to the day that this bites me.
  logger: {
    debug(..._args) {},
    error(..._args) {},
    info(..._args) {},
    log(..._args) {},
    warn(..._args) {},
  },
  authenticate: async (request) => {
    const projectIdHeader =
      request.headers[MAL_PROJECT_ID_HEADER.toLowerCase()];
    const projectId = Array.isArray(projectIdHeader)
      ? projectIdHeader[0]
      : projectIdHeader;

    const taskIdHeader = request.headers[MAL_TASK_ID_HEADER.toLowerCase()];
    const taskId = Array.isArray(taskIdHeader) ? taskIdHeader[0] : taskIdHeader;

    return {
      projectId: projectId as ProjectId | undefined,
      taskId: taskId as TaskId | undefined,
    };
  },
});

mcpServer.addTools(tasksMcpTools);
mcpServer.addTools(projectsMcpTools);

export const startMcp = (services: Services) =>
  withMcpServices(services, () =>
    mcpServer.start({
      transportType: "httpStream",
      httpStream: {
        host: "0.0.0.0",
        port: 3050,
        stateless: true,
      },
    }),
  );
