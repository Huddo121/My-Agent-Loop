import type { WorkspaceId } from "@mono/api";
import type { UserId } from "../auth/UserId";
import type { CreateWorkspace, UpdateWorkspace, Workspace } from "./Workspace";

export interface WorkspacesService {
  getAllWorkspacesForUser(userId: UserId): Promise<Workspace[]>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | undefined>;
  createWorkspaceForUser(
    userId: UserId,
    workspace: CreateWorkspace,
  ): Promise<Workspace>;
  updateWorkspace(
    id: WorkspaceId,
    update: UpdateWorkspace,
  ): Promise<Workspace | undefined>;
}
