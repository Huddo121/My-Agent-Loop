// SandboxType is the single source of truth for the wire and TS type.
// The Postgres enum values in apps/server/src/db/schema.ts must match — keep them in sync.
import type { ProjectId, SandboxType, WorkspaceId } from "@mono/api";
import { eq } from "drizzle-orm";
import { sandboxTypeConfigurationTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";

export type { SandboxType };

const DEFAULT_SANDBOX_TYPE: SandboxType = "docker";

export interface SandboxTypeConfigRepository {
  getWorkspaceConfig(workspaceId: WorkspaceId): Promise<SandboxType | null>;
  getProjectConfig(projectId: ProjectId): Promise<SandboxType | null>;
  setWorkspaceConfig(
    workspaceId: WorkspaceId,
    type: SandboxType | null,
  ): Promise<void>;
  setProjectConfig(
    projectId: ProjectId,
    type: SandboxType | null,
  ): Promise<void>;
  /** Convenience: set the sandbox type for a workspace or project target. */
  setSandboxType(
    target: { workspaceId: WorkspaceId } | { projectId: ProjectId },
    type: SandboxType,
  ): Promise<void>;
  /** Resolve effective sandbox type: project → workspace → 'docker'. */
  resolveSandboxType(
    projectId: ProjectId,
    workspaceId: WorkspaceId,
  ): Promise<SandboxType>;
}

export class DatabaseSandboxTypeConfigRepository
  implements SandboxTypeConfigRepository
{
  async getWorkspaceConfig(
    workspaceId: WorkspaceId,
  ): Promise<SandboxType | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ sandboxType: sandboxTypeConfigurationTable.sandboxType })
      .from(sandboxTypeConfigurationTable)
      .where(eq(sandboxTypeConfigurationTable.workspaceId, workspaceId))
      .limit(1);
    return row?.sandboxType ?? null;
  }

  async getProjectConfig(projectId: ProjectId): Promise<SandboxType | null> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ sandboxType: sandboxTypeConfigurationTable.sandboxType })
      .from(sandboxTypeConfigurationTable)
      .where(eq(sandboxTypeConfigurationTable.projectId, projectId))
      .limit(1);
    return row?.sandboxType ?? null;
  }

  async setWorkspaceConfig(
    workspaceId: WorkspaceId,
    type: SandboxType | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(sandboxTypeConfigurationTable)
      .where(eq(sandboxTypeConfigurationTable.workspaceId, workspaceId));
    if (type !== null) {
      await tx.insert(sandboxTypeConfigurationTable).values({
        workspaceId,
        sandboxType: type,
      });
    }
  }

  async setProjectConfig(
    projectId: ProjectId,
    type: SandboxType | null,
  ): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(sandboxTypeConfigurationTable)
      .where(eq(sandboxTypeConfigurationTable.projectId, projectId));
    if (type !== null) {
      await tx.insert(sandboxTypeConfigurationTable).values({
        projectId,
        sandboxType: type,
      });
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
    const [projectConfig, workspaceConfig] = await Promise.all([
      this.getProjectConfig(projectId),
      this.getWorkspaceConfig(workspaceId),
    ]);
    return projectConfig ?? workspaceConfig ?? DEFAULT_SANDBOX_TYPE;
  }
}
