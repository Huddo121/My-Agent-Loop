import type { ProjectId, SandboxType, WorkspaceId } from "@mono/api";
import type { SandboxTypeConfigRepository } from "../sandbox/SandboxTypeConfigRepository";

const DEFAULT_SANDBOX_TYPE: SandboxType = "docker";

/**
 * In-memory sandbox type resolution matching production precedence:
 * project → workspace → default 'docker'.
 */
export class FakeSandboxTypeConfigRepository
  implements SandboxTypeConfigRepository
{
  private readonly workspaceConfig = new Map<WorkspaceId, SandboxType>();
  private readonly projectConfig = new Map<ProjectId, SandboxType>();

  async getWorkspaceConfig(
    workspaceId: WorkspaceId,
  ): Promise<SandboxType | null> {
    return this.workspaceConfig.get(workspaceId) ?? null;
  }

  async getProjectConfig(projectId: ProjectId): Promise<SandboxType | null> {
    return this.projectConfig.get(projectId) ?? null;
  }

  async setWorkspaceConfig(
    workspaceId: WorkspaceId,
    type: SandboxType | null,
  ): Promise<void> {
    if (type === null) {
      this.workspaceConfig.delete(workspaceId);
    } else {
      this.workspaceConfig.set(workspaceId, type);
    }
  }

  async setProjectConfig(
    projectId: ProjectId,
    type: SandboxType | null,
  ): Promise<void> {
    if (type === null) {
      this.projectConfig.delete(projectId);
    } else {
      this.projectConfig.set(projectId, type);
    }
  }

  async setSandboxType(
    target: { workspaceId: WorkspaceId } | { projectId: ProjectId },
    type: SandboxType,
  ): Promise<void> {
    if ("workspaceId" in target) {
      await this.setWorkspaceConfig(target.workspaceId, type);
    } else {
      await this.setProjectConfig(target.projectId, type);
    }
  }

  async resolveSandboxType(
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<SandboxType> {
    const [projectC, workspaceC] = await Promise.all([
      this.getProjectConfig(projectId),
      this.getWorkspaceConfig(workspaceId),
    ]);
    return projectC ?? workspaceC ?? DEFAULT_SANDBOX_TYPE;
  }
}
