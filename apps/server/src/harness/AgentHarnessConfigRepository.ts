import type { AgentHarnessId, ProjectId, TaskId, WorkspaceId } from "@mono/api";
import { eq, inArray } from "drizzle-orm";
import { agentHarnessConfigurationTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";

const DEFAULT_HARNESS_ID: AgentHarnessId = "opencode";

export interface AgentHarnessConfigRepository {
  getWorkspaceConfig(workspaceId: WorkspaceId): Promise<AgentHarnessId | null>;
  getProjectConfig(projectId: ProjectId): Promise<AgentHarnessId | null>;
  getTaskConfig(taskId: TaskId): Promise<AgentHarnessId | null>;
  /** Fetch the task-level harness config (not resolved) for multiple tasks in one query. */
  getTaskConfigs(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, AgentHarnessId | null>>;
  setWorkspaceConfig(
    workspaceId: WorkspaceId,
    agentHarnessId: AgentHarnessId | null,
  ): Promise<void>;
  setProjectConfig(
    projectId: ProjectId,
    agentHarnessId: AgentHarnessId | null,
  ): Promise<void>;
  setTaskConfig(
    taskId: TaskId,
    agentHarnessId: AgentHarnessId | null,
  ): Promise<void>;
  resolveHarnessId(
    taskId: TaskId,
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<AgentHarnessId>;
}

export class DatabaseAgentHarnessConfigRepository
  implements AgentHarnessConfigRepository
{
  async getWorkspaceConfig(
    workspaceId: WorkspaceId,
  ): Promise<AgentHarnessId | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ agentHarnessId: agentHarnessConfigurationTable.agentHarnessId })
      .from(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.workspaceId, workspaceId))
      .limit(1);
    return row?.agentHarnessId ?? null;
  }

  async getProjectConfig(projectId: ProjectId): Promise<AgentHarnessId | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ agentHarnessId: agentHarnessConfigurationTable.agentHarnessId })
      .from(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.projectId, projectId))
      .limit(1);
    return row?.agentHarnessId ?? null;
  }

  async getTaskConfig(taskId: TaskId): Promise<AgentHarnessId | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ agentHarnessId: agentHarnessConfigurationTable.agentHarnessId })
      .from(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.taskId, taskId))
      .limit(1);
    return row?.agentHarnessId ?? null;
  }

  async setWorkspaceConfig(
    workspaceId: WorkspaceId,
    agentHarnessId: AgentHarnessId | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.workspaceId, workspaceId));
    if (agentHarnessId !== null) {
      await tx.insert(agentHarnessConfigurationTable).values({
        workspaceId,
        agentHarnessId,
      });
    }
  }

  async setProjectConfig(
    projectId: ProjectId,
    agentHarnessId: AgentHarnessId | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.projectId, projectId));
    if (agentHarnessId !== null) {
      await tx.insert(agentHarnessConfigurationTable).values({
        projectId,
        agentHarnessId,
      });
    }
  }

  async setTaskConfig(
    taskId: TaskId,
    agentHarnessId: AgentHarnessId | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.taskId, taskId));
    if (agentHarnessId !== null) {
      await tx.insert(agentHarnessConfigurationTable).values({
        taskId,
        agentHarnessId,
      });
    }
  }

  async getTaskConfigs(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, AgentHarnessId | null>> {
    if (taskIds.length === 0) return new Map();
    const tx = getTransaction();
    const rows = await tx
      .select({
        taskId: agentHarnessConfigurationTable.taskId,
        agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
      })
      .from(agentHarnessConfigurationTable)
      .where(inArray(agentHarnessConfigurationTable.taskId, taskIds));
    const map = new Map<TaskId, AgentHarnessId | null>();
    for (const taskId of taskIds) {
      const row = rows.find((r) => r.taskId === taskId);
      map.set(taskId, (row?.agentHarnessId ?? null) as AgentHarnessId | null);
    }
    return map;
  }

  async resolveHarnessId(
    taskId: TaskId,
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<AgentHarnessId> {
    const [taskConfig, projectConfig, workspaceConfig] = await Promise.all([
      this.getTaskConfig(taskId),
      this.getProjectConfig(projectId),
      this.getWorkspaceConfig(workspaceId),
    ]);
    return taskConfig ?? projectConfig ?? workspaceConfig ?? DEFAULT_HARNESS_ID;
  }
}
