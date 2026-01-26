import { FastMCP } from "fastmcp";
import { projectsMcpTools } from "./projects/projects-mcp-handlers";
import type { Services } from "./services";
import { tasksMcpTools } from "./tasks/tasks-mcp-handlers";
import { withMcpServices } from "./utils/mcp-service-context";

const mcpServer = new FastMCP({
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
