import type { WorkspaceId } from "@mono/api";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  createdAt: Date;
}

export type CreateWorkspace = { name: string };
