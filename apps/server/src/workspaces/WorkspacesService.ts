import type { WorkspaceId } from "@mono/api";
import type { CreateWorkspace, UpdateWorkspace, Workspace } from "./Workspace";

export interface WorkspacesService {
  getAllWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | undefined>;
  createWorkspace(workspace: CreateWorkspace): Promise<Workspace>;
  updateWorkspace(
    id: WorkspaceId,
    update: UpdateWorkspace,
  ): Promise<Workspace | undefined>;
}
