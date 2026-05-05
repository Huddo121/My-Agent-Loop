import type { ProjectId, TaskId, WorkspaceId } from "@mono/api";
import type { UserId } from "../auth/UserId";
import type { WorkspaceMembershipsService } from "../auth/WorkspaceMembershipsService";

const memberKey = (userId: UserId, workspaceId: WorkspaceId) =>
  `${userId}:${workspaceId}`;

type WorkspaceMember = {
  userId: UserId;
  workspaceId: WorkspaceId;
  createdAt: Date;
};

/**
 * In-memory membership and access rules mirroring production checks at a high level.
 */
export class FakeWorkspaceMembershipsService
  implements WorkspaceMembershipsService
{
  private readonly workspaceMembers = new Map<string, WorkspaceMember>();
  private readonly projectWorkspace = new Map<ProjectId, WorkspaceId>();
  private readonly taskContext = new Map<
    TaskId,
    { workspaceId: WorkspaceId; projectId: ProjectId }
  >();

  grantWorkspaceMember(
    userId: UserId,
    workspaceId: WorkspaceId,
    createdAt: Date = new Date(),
  ): void {
    this.workspaceMembers.set(memberKey(userId, workspaceId), {
      userId,
      workspaceId,
      createdAt,
    });
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
    for (const member of this.workspaceMembers.values()) {
      if (member.userId === userId) return true;
    }
    return false;
  }

  async addMembership(userId: UserId, workspaceId: WorkspaceId): Promise<void> {
    this.grantWorkspaceMember(userId, workspaceId);
  }

  async getWorkspaceCreatorUserId(
    workspaceId: WorkspaceId,
  ): Promise<UserId | undefined> {
    const members = [...this.workspaceMembers.values()]
      .filter((member) => member.workspaceId === workspaceId)
      .sort((left, right) => {
        const createdAtComparison =
          left.createdAt.getTime() - right.createdAt.getTime();
        if (createdAtComparison !== 0) {
          return createdAtComparison;
        }
        return left.userId.localeCompare(right.userId);
      });
    return members[0]?.userId;
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
