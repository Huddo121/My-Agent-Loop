import type { WorkspaceId } from "@mono/api";
import type { CreateWorkspace, Workspace } from "./Workspace";

export interface WorkspacesService {
  getAllWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | undefined>;
  createWorkspace(workspace: CreateWorkspace): Promise<Workspace>;
}
