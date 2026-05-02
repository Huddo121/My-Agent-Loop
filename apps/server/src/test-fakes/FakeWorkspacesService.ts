import type { WorkspaceId } from "@mono/api";
import type { UserId } from "../auth/UserId";
import type {
  CreateWorkspace,
  UpdateWorkspace,
  Workspace,
} from "../workspaces/Workspace";
import type { WorkspacesService } from "../workspaces/WorkspacesService";

/**
 * In-memory workspaces keyed by id, with a per-user index for listing.
 */
export class FakeWorkspacesService implements WorkspacesService {
  private readonly workspaces = new Map<WorkspaceId, Workspace>();
  private readonly workspacesByUser = new Map<UserId, WorkspaceId[]>();
  readonly createWorkspaceCalls: Array<{
    userId: UserId;
    workspace: CreateWorkspace;
  }> = [];

  private nextId = 0;

  seedWorkspaceForUser(userId: UserId, workspace: Workspace): void {
    this.workspaces.set(workspace.id, workspace);
    const list = this.workspacesByUser.get(userId) ?? [];
    list.push(workspace.id);
    this.workspacesByUser.set(userId, list);
  }

  async getAllWorkspacesForUser(userId: UserId): Promise<Workspace[]> {
    const ids = this.workspacesByUser.get(userId) ?? [];
    return ids
      .map((id) => this.workspaces.get(id))
      .filter((w): w is Workspace => w !== undefined);
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async createWorkspaceForUser(
    userId: UserId,
    workspace: CreateWorkspace,
  ): Promise<Workspace> {
    this.createWorkspaceCalls.push({ userId, workspace });
    this.nextId++;
    const id = `workspace-${this.nextId}` as WorkspaceId;
    const created: Workspace = {
      id,
      name: workspace.name,
      createdAt: new Date(),
      agentConfig: null,
    };
    this.workspaces.set(id, created);
    const list = this.workspacesByUser.get(userId) ?? [];
    list.push(id);
    this.workspacesByUser.set(userId, list);
    return created;
  }

  async updateWorkspace(
    id: WorkspaceId,
    update: UpdateWorkspace,
  ): Promise<Workspace | undefined> {
    const current = this.workspaces.get(id);
    if (current === undefined) return undefined;
    const next: Workspace = {
      ...current,
      ...update,
      name: update.name ?? current.name,
      agentConfig:
        update.agentConfig !== undefined
          ? update.agentConfig
          : current.agentConfig,
    };
    this.workspaces.set(id, next);
    return next;
  }
}
