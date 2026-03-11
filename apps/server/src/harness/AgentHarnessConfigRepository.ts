import type { AgentHarnessId, ProjectId, TaskId, WorkspaceId } from "@mono/api";
import { eq, inArray } from "drizzle-orm";
import { agentHarnessConfigurationTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";

const DEFAULT_HARNESS_ID: AgentHarnessId = "opencode";

export type ScopedHarnessConfig = {
  harnessId: AgentHarnessId;
  modelId: string | null;
};

export interface AgentHarnessConfigRepository {
  getWorkspaceConfig(
    workspaceId: WorkspaceId,
  ): Promise<ScopedHarnessConfig | null>;
  getProjectConfig(projectId: ProjectId): Promise<ScopedHarnessConfig | null>;
  /** Fetch the project-level harness config (not resolved) for multiple projects in one query. */
  getProjectConfigs(
    projectIds: ProjectId[],
  ): Promise<Record<ProjectId, ScopedHarnessConfig | null>>;
  getTaskConfig(taskId: TaskId): Promise<ScopedHarnessConfig | null>;
  /** Fetch the task-level harness config (not resolved) for multiple tasks in one query. */
  getTaskConfigs(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, ScopedHarnessConfig | null>>;
  setWorkspaceConfig(
    workspaceId: WorkspaceId,
    config: ScopedHarnessConfig | null,
  ): Promise<void>;
  setProjectConfig(
    projectId: ProjectId,
    config: ScopedHarnessConfig | null,
  ): Promise<void>;
  setTaskConfig(
    taskId: TaskId,
    config: ScopedHarnessConfig | null,
  ): Promise<void>;
  resolveHarnessConfig(
    taskId: TaskId,
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<ScopedHarnessConfig>;
}

export class DatabaseAgentHarnessConfigRepository
  implements AgentHarnessConfigRepository
{
  async getWorkspaceConfig(
    workspaceId: WorkspaceId,
  ): Promise<ScopedHarnessConfig | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({
        agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
        agentModelId: agentHarnessConfigurationTable.agentModelId,
      })
      .from(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.workspaceId, workspaceId))
      .limit(1);
    if (!row) return null;
    return {
      harnessId: row.agentHarnessId,
      modelId: row.agentModelId,
    };
  }

  async getProjectConfig(
    projectId: ProjectId,
  ): Promise<ScopedHarnessConfig | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({
        agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
        agentModelId: agentHarnessConfigurationTable.agentModelId,
      })
      .from(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.projectId, projectId))
      .limit(1);
    if (!row) return null;
    return {
      harnessId: row.agentHarnessId,
      modelId: row.agentModelId,
    };
  }

  async getProjectConfigs(
    projectIds: ProjectId[],
  ): Promise<Record<ProjectId, ScopedHarnessConfig | null>> {
    if (projectIds.length === 0) return {};
    const tx = getTransaction();
    const rows = await tx
      .select({
        projectId: agentHarnessConfigurationTable.projectId,
        agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
        agentModelId: agentHarnessConfigurationTable.agentModelId,
      })
      .from(agentHarnessConfigurationTable)
      .where(inArray(agentHarnessConfigurationTable.projectId, projectIds));
    const map: Record<ProjectId, ScopedHarnessConfig | null> = {};
    for (const projectId of projectIds) {
      const row = rows.find((r) => r.projectId === projectId);
      map[projectId] = row
        ? {
            harnessId: row.agentHarnessId,
            modelId: row.agentModelId,
          }
        : null;
    }
    return map;
  }

  async getTaskConfig(taskId: TaskId): Promise<ScopedHarnessConfig | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({
        agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
        agentModelId: agentHarnessConfigurationTable.agentModelId,
      })
      .from(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.taskId, taskId))
      .limit(1);
    if (!row) return null;
    return {
      harnessId: row.agentHarnessId,
      modelId: row.agentModelId,
    };
  }

  async setWorkspaceConfig(
    workspaceId: WorkspaceId,
    config: ScopedHarnessConfig | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.workspaceId, workspaceId));
    if (config !== null) {
      await tx.insert(agentHarnessConfigurationTable).values({
        workspaceId,
        agentHarnessId: config.harnessId,
        agentModelId: config.modelId,
      });
    }
  }

  async setProjectConfig(
    projectId: ProjectId,
    config: ScopedHarnessConfig | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.projectId, projectId));
    if (config !== null) {
      await tx.insert(agentHarnessConfigurationTable).values({
        projectId,
        agentHarnessId: config.harnessId,
        agentModelId: config.modelId,
      });
    }
  }

  async setTaskConfig(
    taskId: TaskId,
    config: ScopedHarnessConfig | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(agentHarnessConfigurationTable)
      .where(eq(agentHarnessConfigurationTable.taskId, taskId));
    if (config !== null) {
      await tx.insert(agentHarnessConfigurationTable).values({
        taskId,
        agentHarnessId: config.harnessId,
        agentModelId: config.modelId,
      });
    }
  }

  async getTaskConfigs(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, ScopedHarnessConfig | null>> {
    if (taskIds.length === 0) return new Map();
    const tx = getTransaction();
    const rows = await tx
      .select({
        taskId: agentHarnessConfigurationTable.taskId,
        agentHarnessId: agentHarnessConfigurationTable.agentHarnessId,
        agentModelId: agentHarnessConfigurationTable.agentModelId,
      })
      .from(agentHarnessConfigurationTable)
      .where(inArray(agentHarnessConfigurationTable.taskId, taskIds));
    const map = new Map<TaskId, ScopedHarnessConfig | null>();
    for (const taskId of taskIds) {
      const row = rows.find((r) => r.taskId === taskId);
      map.set(
        taskId,
        row
          ? {
              harnessId: row.agentHarnessId,
              modelId: row.agentModelId,
            }
          : null,
      );
    }
    return map;
  }

  async resolveHarnessConfig(
    taskId: TaskId,
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<ScopedHarnessConfig> {
    const [taskConfig, projectConfig, workspaceConfig] = await Promise.all([
      this.getTaskConfig(taskId),
      this.getProjectConfig(projectId),
      this.getWorkspaceConfig(workspaceId),
    ]);
    return (
      taskConfig ??
      projectConfig ??
      workspaceConfig ?? {
        harnessId: DEFAULT_HARNESS_ID,
        modelId: null,
      }
    );
  }
}
