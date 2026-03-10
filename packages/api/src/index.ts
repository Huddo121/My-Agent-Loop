import { adminApi } from "./admin/admin-api";
import { workspacesApi } from "./workspaces/workspaces-api";

export * from "./admin/admin-api";
export * from "./handler-utils";
export * from "./harnesses/harnesses-model";
export * from "./projects/projects-api";
export * from "./projects/projects-model";
export * from "./runs/runs-api";
export * from "./runs/runs-model";
export * from "./tasks/tasks-api";
export * from "./tasks/tasks-model";
export * from "./workspaces/workspaces-api";
export {
  type WorkspaceId,
  workspaceIdSchema,
} from "./workspaces/workspaces-model";

export const myAgentLoopApi = {
  admin: adminApi,
  workspaces: workspacesApi,
};

export type MyAgentLoopApi = typeof myAgentLoopApi;
