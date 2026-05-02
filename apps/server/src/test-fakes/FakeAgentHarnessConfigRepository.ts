import type { AgentHarnessId, ProjectId, TaskId, WorkspaceId } from "@mono/api";
import type {
  AgentHarnessConfigRepository,
  ScopedHarnessConfig,
} from "../harness/AgentHarnessConfigRepository";

const DEFAULT_HARNESS_ID: AgentHarnessId = "opencode";

/**
 * In-memory harness configuration resolution matching production precedence:
 * task → project → workspace → default.
 */
export class FakeAgentHarnessConfigRepository
  implements AgentHarnessConfigRepository
{
  private readonly workspaceConfig = new Map<
    WorkspaceId,
    ScopedHarnessConfig | null
  >();
  private readonly projectConfig = new Map<
    ProjectId,
    ScopedHarnessConfig | null
  >();
  private readonly taskConfig = new Map<TaskId, ScopedHarnessConfig | null>();

  async getWorkspaceConfig(
    workspaceId: WorkspaceId,
  ): Promise<ScopedHarnessConfig | null> {
    return this.workspaceConfig.get(workspaceId) ?? null;
  }

  async getProjectConfig(
    projectId: ProjectId,
  ): Promise<ScopedHarnessConfig | null> {
    return this.projectConfig.get(projectId) ?? null;
  }

  async getProjectConfigs(
    projectIds: ProjectId[],
  ): Promise<Record<ProjectId, ScopedHarnessConfig | null>> {
    const out = {} as Record<ProjectId, ScopedHarnessConfig | null>;
    for (const id of projectIds) {
      out[id] = await this.getProjectConfig(id);
    }
    return out;
  }

  async getTaskConfig(taskId: TaskId): Promise<ScopedHarnessConfig | null> {
    return this.taskConfig.get(taskId) ?? null;
  }

  async getTaskConfigs(
    taskIds: TaskId[],
  ): Promise<Map<TaskId, ScopedHarnessConfig | null>> {
    const map = new Map<TaskId, ScopedHarnessConfig | null>();
    for (const id of taskIds) {
      map.set(id, await this.getTaskConfig(id));
    }
    return map;
  }

  async setWorkspaceConfig(
    workspaceId: WorkspaceId,
    config: ScopedHarnessConfig | null,
  ): Promise<void> {
    if (config === null) {
      this.workspaceConfig.delete(workspaceId);
    } else {
      this.workspaceConfig.set(workspaceId, config);
    }
  }

  async setProjectConfig(
    projectId: ProjectId,
    config: ScopedHarnessConfig | null,
  ): Promise<void> {
    if (config === null) {
      this.projectConfig.delete(projectId);
    } else {
      this.projectConfig.set(projectId, config);
    }
  }

  async setTaskConfig(
    taskId: TaskId,
    config: ScopedHarnessConfig | null,
  ): Promise<void> {
    if (config === null) {
      this.taskConfig.delete(taskId);
    } else {
      this.taskConfig.set(taskId, config);
    }
  }

  async resolveHarnessConfig(
    taskId: TaskId,
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<ScopedHarnessConfig> {
    const [taskC, projectC, workspaceC] = await Promise.all([
      this.getTaskConfig(taskId),
      this.getProjectConfig(projectId),
      this.getWorkspaceConfig(workspaceId),
    ]);
    return (
      taskC ??
      projectC ??
      workspaceC ?? {
        harnessId: DEFAULT_HARNESS_ID,
        modelId: null,
      }
    );
  }
}
