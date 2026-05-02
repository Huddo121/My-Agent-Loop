import type { ProjectId, TaskId, WorkspaceId } from "@mono/api";
import type { UserId } from "../auth/UserId";
import type { WorkspaceMembershipsService } from "../auth/WorkspaceMembershipsService";

const memberKey = (userId: UserId, workspaceId: WorkspaceId) =>
  `${userId}:${workspaceId}`;

/**
 * In-memory membership and access rules mirroring production checks at a high level.
 */
export class FakeWorkspaceMembershipsService
  implements WorkspaceMembershipsService
{
  private readonly workspaceMembers = new Set<string>();
  private readonly projectWorkspace = new Map<ProjectId, WorkspaceId>();
  private readonly taskContext = new Map<
    TaskId,
    { workspaceId: WorkspaceId; projectId: ProjectId }
  >();

  grantWorkspaceMember(userId: UserId, workspaceId: WorkspaceId): void {
    this.workspaceMembers.add(memberKey(userId, workspaceId));
  }

  /** Declare that a project belongs to a workspace (required for `canAccessProject`). */
  setProjectWorkspace(projectId: ProjectId, workspaceId: WorkspaceId): void {
    this.projectWorkspace.set(projectId, workspaceId);
  }

  /** Declare a task's project/workspace (required for `canAccessTask`). */
  setTaskContext(
    taskId: TaskId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): void {
    this.taskContext.set(taskId, { workspaceId, projectId });
  }

  async userHasAnyWorkspace(userId: UserId): Promise<boolean> {
    for (const key of this.workspaceMembers) {
      if (key.startsWith(`${userId}:`)) return true;
    }
    return false;
  }

  async addMembership(userId: UserId, workspaceId: WorkspaceId): Promise<void> {
    this.workspaceMembers.add(memberKey(userId, workspaceId));
  }

  async isWorkspaceMember(
    userId: UserId,
    workspaceId: WorkspaceId,
  ): Promise<boolean> {
    return this.workspaceMembers.has(memberKey(userId, workspaceId));
  }

  async canAccessProject(
    userId: UserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): Promise<boolean> {
    if (!(await this.isWorkspaceMember(userId, workspaceId))) return false;
    return this.projectWorkspace.get(projectId) === workspaceId;
  }

  async canAccessTask(
    userId: UserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    taskId: TaskId,
  ): Promise<boolean> {
    const ctx = this.taskContext.get(taskId);
    if (ctx === undefined) return false;
    if (ctx.workspaceId !== workspaceId || ctx.projectId !== projectId) {
      return false;
    }
    return this.canAccessProject(userId, workspaceId, projectId);
  }
}
