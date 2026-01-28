import { adminApi } from "./admin/admin-api";
import { projectsApi } from "./projects/projects-api";

export * from "./admin/admin-api";
export * from "./handler-utils";
export * from "./projects/projects-api";
export * from "./projects/projects-model";
export * from "./runs/runs-api";
export * from "./runs/runs-model";
export * from "./tasks/tasks-api";
export * from "./tasks/tasks-model";

export const myAgentLoopApi = {
  admin: adminApi,
  projects: projectsApi,
};

export type MyAgentLoopApi = typeof myAgentLoopApi;
