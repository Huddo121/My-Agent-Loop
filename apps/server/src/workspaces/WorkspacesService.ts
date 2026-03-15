import type { WorkspaceId } from "@mono/api";
import type { CreateWorkspace, UpdateWorkspace, Workspace } from "./Workspace";

export interface WorkspacesService {
  getAllWorkspacesForUser(userId: string): Promise<Workspace[]>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | undefined>;
  createWorkspaceForUser(
    userId: string,
    workspace: CreateWorkspace,
  ): Promise<Workspace>;
  updateWorkspace(
    id: WorkspaceId,
    update: UpdateWorkspace,
  ): Promise<Workspace | undefined>;
}
