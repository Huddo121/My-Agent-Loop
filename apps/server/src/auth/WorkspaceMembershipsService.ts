import type { ProjectId, TaskId, WorkspaceId } from "@mono/api";
import { and, eq } from "drizzle-orm";
import {
  projectsTable,
  tasksTable,
  workspaceMembershipsTable,
} from "../db/schema";
import { getTransaction } from "../utils/transaction-context";
import type { UserId } from "./UserId";

export interface WorkspaceMembershipsService {
  userHasAnyWorkspace(userId: UserId): Promise<boolean>;
  addMembership(userId: UserId, workspaceId: WorkspaceId): Promise<void>;
  isWorkspaceMember(userId: UserId, workspaceId: WorkspaceId): Promise<boolean>;
  canAccessProject(
    userId: UserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): Promise<boolean>;
  canAccessTask(
    userId: UserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    taskId: TaskId,
  ): Promise<boolean>;
}

export class DatabaseWorkspaceMembershipsService
  implements WorkspaceMembershipsService
{
  async userHasAnyWorkspace(userId: UserId): Promise<boolean> {
    const tx = getTransaction();
    const membership = await tx.query.workspaceMembershipsTable.findFirst({
      where: eq(workspaceMembershipsTable.userId, userId),
    });
    return membership !== undefined;
  }

  async addMembership(userId: UserId, workspaceId: WorkspaceId): Promise<void> {
    const tx = getTransaction();
    await tx.insert(workspaceMembershipsTable).values({
      userId,
      workspaceId,
    });
  }

  async isWorkspaceMember(
    userId: UserId,
    workspaceId: WorkspaceId,
  ): Promise<boolean> {
    const tx = getTransaction();
    const membership = await tx.query.workspaceMembershipsTable.findFirst({
      where: and(
        eq(workspaceMembershipsTable.userId, userId),
        eq(workspaceMembershipsTable.workspaceId, workspaceId),
      ),
    });
    return membership !== undefined;
  }

  async canAccessProject(
    userId: UserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): Promise<boolean> {
    const tx = getTransaction();
    const project = await tx
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .innerJoin(
        workspaceMembershipsTable,
        and(
          eq(workspaceMembershipsTable.workspaceId, projectsTable.workspaceId),
          eq(workspaceMembershipsTable.userId, userId),
        ),
      )
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return project.length > 0;
  }

  async canAccessTask(
    userId: UserId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    taskId: TaskId,
  ): Promise<boolean> {
    const tx = getTransaction();
    const task = await tx
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .innerJoin(projectsTable, eq(projectsTable.id, tasksTable.projectId))
      .innerJoin(
        workspaceMembershipsTable,
        and(
          eq(workspaceMembershipsTable.workspaceId, projectsTable.workspaceId),
          eq(workspaceMembershipsTable.userId, userId),
        ),
      )
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.projectId, projectId),
          eq(projectsTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return task.length > 0;
  }
}
